import { resolveRuntimeConfig } from '../config/runtime';
import { D1DatabaseAdapter, type D1DatabaseLike } from '../database/d1';
import { AccountRepository } from '../repositories/AccountRepository';
import { MailCacheRepository } from '../repositories/MailCacheRepository';
import { ProxyRepository } from '../repositories/ProxyRepository';
import { DashboardService } from '../services/DashboardService';
import { getRuntimeCapabilities } from '../runtime/capabilities';

type CloudflareEnv = Record<string, unknown>;
type WorkerResponse = unknown;

interface WorkerRequest {
  url: string;
}

interface AssetsBinding {
  fetch(request: WorkerRequest): Promise<WorkerResponse> | WorkerResponse;
}

declare const Response: {
  json(body: unknown, init?: { status?: number }): WorkerResponse;
};
declare const URL: {
  new (url: string): {
    pathname: string;
    searchParams: {
      get(name: string): string | null;
    };
  };
};

function toEnvRecord(env: CloudflareEnv): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }

  return result;
}

function json(data: unknown, status = 200): WorkerResponse {
  return Response.json({
    code: status,
    data,
  }, { status });
}

function parseNumber(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export default {
  async fetch(request: WorkerRequest, env: CloudflareEnv): Promise<WorkerResponse> {
    const url = new URL(request.url);
    const config = resolveRuntimeConfig({
      runtime: 'cloudflare',
      env: toEnvRecord(env),
    });

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        runtime: config.runtime,
        dbProvider: config.db.provider,
        dbBinding: config.db.binding,
        hasD1Binding: env[config.db.binding] !== undefined,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/runtime') {
      return json({
        runtime: config.runtime,
        logLevel: config.logLevel,
        db: config.db,
      });
    }

    if (url.pathname === '/api/runtime/capabilities') {
      return json(getRuntimeCapabilities(config.runtime));
    }

    if (url.pathname === '/api/accounts') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new AccountRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );

      const page = parseNumber(url.searchParams.get('page'), 1);
      const pageSize = parseNumber(url.searchParams.get('pageSize'), 20);
      const search = url.searchParams.get('search') || '';

      const data = await repository.list(page, pageSize, search);
      return json(data);
    }

    if (url.pathname === '/api/dashboard/stats') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const adapter = new D1DatabaseAdapter(binding as D1DatabaseLike);
      const dashboardService = new DashboardService({
        accountReader: new AccountRepository(adapter),
        cacheReader: new MailCacheRepository(adapter),
        proxyReader: new ProxyRepository(adapter),
      });

      const data = await dashboardService.getStats();
      return json(data);
    }

    if (!url.pathname.startsWith('/api')) {
      const assets = env.ASSETS as AssetsBinding | undefined;
      if (assets && typeof assets.fetch === 'function') {
        return assets.fetch(request);
      }
    }

    return json({
      message: 'Cloudflare worker entry is ready, API migration is in progress.',
      runtime: config.runtime,
    }, 404);
  },
};
