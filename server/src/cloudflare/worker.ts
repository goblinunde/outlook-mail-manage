import { resolveRuntimeConfig } from '../config/runtime';
import { D1DatabaseAdapter, type D1DatabaseLike } from '../database/d1';
import { AccountRepository } from '../repositories/AccountRepository';
import { MailCacheRepository } from '../repositories/MailCacheRepository';
import { ProxyRepository } from '../repositories/ProxyRepository';
import { TagRepository } from '../repositories/TagRepository';
import { DashboardService } from '../services/DashboardService';
import { getRuntimeCapabilities } from '../runtime/capabilities';
import type { FetchMailsResult, MailMessage } from '../types';

type CloudflareEnv = Record<string, unknown>;
type WorkerResponse = unknown;
const proxyManagementUnsupportedMessage = 'Cloudflare Workers does not support outbound proxy management. Creating, editing, deleting, testing, and setting default proxies are unavailable.';

interface WorkerRequest {
  url: string;
  method?: string;
  headers?: {
    get(name: string): string | null;
  } | Record<string, string>;
  json?(): Promise<unknown>;
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
declare const crypto: {
  subtle: {
    digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
  };
};
declare const TextEncoder: {
  new (): {
    encode(input: string): Uint8Array;
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

function matchId(pathname: string, pattern: RegExp): number | undefined {
  const matched = pathname.match(pattern);
  if (!matched) {
    return undefined;
  }

  return Number.parseInt(matched[1], 10);
}

function getMethod(request: WorkerRequest): string {
  return (request.method || 'GET').toUpperCase();
}

function getHeader(request: WorkerRequest, name: string): string | undefined {
  if (!request.headers) {
    return undefined;
  }

  if (typeof request.headers.get === 'function') {
    return request.headers.get(name) || undefined;
  }

  const normalized = name.toLowerCase();
  const matched = Object.entries(request.headers)
    .find(([key]) => key.toLowerCase() === normalized);

  return matched?.[1];
}

async function readJsonBody<T>(request: WorkerRequest): Promise<T> {
  if (!request.json) {
    return {} as T;
  }

  return request.json() as Promise<T>;
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function unauthorized(): WorkerResponse {
  return Response.json({
    code: 401,
    data: null,
    message: 'Unauthorized',
  }, { status: 401 });
}

function unsupported(message: string): WorkerResponse {
  return Response.json({
    code: 501,
    data: null,
    message,
  }, { status: 501 });
}

async function refreshGraphToken(clientId: string, refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  has_mail_scope: boolean;
}> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'https://graph.microsoft.com/.default offline_access',
  }).toString();

  const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`OAuth token refresh failed: ${response.status}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    has_mail_scope: data.scope?.includes('Mail.Read') ?? false,
  };
}

async function fetchGraphMails(accessToken: string, mailbox: string, top = 50): Promise<Partial<MailMessage>[]> {
  const folder = mailbox === 'Junk' ? 'junkemail' : 'inbox';
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$top=${top}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Graph API fetch failed: ${response.status}`);
  }

  const data = await response.json() as {
    value?: Array<{
      id: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      subject?: string;
      bodyPreview?: string;
      body?: { content?: string };
      createdDateTime?: string;
    }>;
  };

  return (data.value || []).map((item) => ({
    mail_id: item.id,
    sender: item.from?.emailAddress?.address || '',
    sender_name: item.from?.emailAddress?.name || '',
    subject: item.subject || '',
    text_content: item.bodyPreview || '',
    html_content: item.body?.content || '',
    mail_date: item.createdDateTime || '',
  }));
}

async function deleteAllGraphMails(accessToken: string, mailbox: string): Promise<void> {
  const mails = await fetchGraphMails(accessToken, mailbox, 1000);

  for (const mail of mails) {
    if (!mail.mail_id) {
      continue;
    }

    await fetch(`https://graph.microsoft.com/v1.0/me/messages/${mail.mail_id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }
}

export default {
  async fetch(request: WorkerRequest, env: CloudflareEnv): Promise<WorkerResponse> {
    const url = new URL(request.url);
    const method = getMethod(request);
    const config = resolveRuntimeConfig({
      runtime: 'cloudflare',
      env: toEnvRecord(env),
    });

    if (url.pathname === '/api/auth/check' && method === 'GET') {
      return json({ required: !!config.accessPassword });
    }

    if (url.pathname === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody<{ password?: string }>(request);

      if (!config.accessPassword) {
        return json({ token: '', required: false });
      }

      if (body.password !== config.accessPassword) {
        return Response.json({
          code: 401,
          data: null,
          message: 'Invalid password',
        }, { status: 401 });
      }

      return json({
        token: await hashPassword(config.accessPassword),
        required: true,
      });
    }

    if (config.accessPassword && url.pathname.startsWith('/api')) {
      const token = getHeader(request, 'Authorization')?.replace('Bearer ', '');
      if (!token || token !== await hashPassword(config.accessPassword)) {
        return unauthorized();
      }
    }

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

      if (method === 'GET') {
        const page = parseNumber(url.searchParams.get('page'), 1);
        const pageSize = parseNumber(url.searchParams.get('pageSize'), 20);
        const search = url.searchParams.get('search') || '';

        const data = await repository.list(page, pageSize, search);
        return json(data);
      }

      if (method === 'POST') {
        const body = await readJsonBody<{
          email?: string;
          password?: string;
          client_id?: string;
          refresh_token?: string;
          remark?: string;
        }>(request);

        if (!body.email || !body.client_id || !body.refresh_token) {
          return Response.json({
            code: 400,
            data: null,
            message: 'Missing required fields: email, client_id, refresh_token',
          }, { status: 400 });
        }

        return json(await repository.create(body));
      }
    }

    const accountId = matchId(url.pathname, /^\/api\/accounts\/(\d+)$/);
    if (accountId !== undefined) {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new AccountRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );

      if (method === 'PUT') {
        const body = await readJsonBody<Record<string, unknown>>(request);
        const updated = await repository.update(accountId, body);
        if (!updated) {
          return Response.json({
            code: 404,
            data: null,
            message: 'Account not found',
          }, { status: 404 });
        }

        return json(updated);
      }

      if (method === 'DELETE') {
        const deleted = await repository.delete(accountId);
        if (!deleted) {
          return Response.json({
            code: 404,
            data: null,
            message: 'Account not found',
          }, { status: 404 });
        }

        return json({ deleted: true });
      }
    }

    const accountTagsId = matchId(url.pathname, /^\/api\/accounts\/(\d+)\/tags$/);
    if (accountTagsId !== undefined && method === 'POST') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new AccountRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );
      const body = await readJsonBody<{ tag_ids?: number[] }>(request);
      if (!Array.isArray(body.tag_ids)) {
        return Response.json({
          code: 400,
          data: null,
          message: 'tag_ids must be an array',
        }, { status: 400 });
      }

      await repository.setTags(accountTagsId, body.tag_ids);
      return json({ account_id: accountTagsId, tag_ids: body.tag_ids });
    }

    if (url.pathname === '/api/accounts/batch-delete' && method === 'POST') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new AccountRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );
      const body = await readJsonBody<{ ids?: number[] }>(request);
      if (!Array.isArray(body.ids) || body.ids.length === 0) {
        return Response.json({
          code: 400,
          data: null,
          message: 'ids must be a non-empty array',
        }, { status: 400 });
      }

      return json({ deleted: await repository.batchDelete(body.ids) });
    }

    if (url.pathname === '/api/accounts/import-preview' && method === 'POST') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new AccountRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );
      const body = await readJsonBody<{
        content?: string;
        separator?: string;
        format?: string[];
      }>(request);
      if (!body.content) {
        return Response.json({
          code: 400,
          data: null,
          message: 'content is required',
        }, { status: 400 });
      }

      return json(await repository.importPreview({
        content: body.content,
        separator: body.separator || '----',
        format: body.format || ['email', 'password', 'client_id', 'refresh_token'],
      }));
    }

    if (url.pathname === '/api/mails/cached' && method === 'GET') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new MailCacheRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );
      const accountId = parseNumber(url.searchParams.get('account_id'), 0);
      const mailbox = url.searchParams.get('mailbox') || 'INBOX';
      const page = parseNumber(url.searchParams.get('page'), 1);
      const pageSize = parseNumber(url.searchParams.get('pageSize'), 50);

      if (!accountId) {
        return Response.json({
          code: 400,
          data: null,
          message: 'account_id is required',
        }, { status: 400 });
      }

      return json(await repository.getByAccount(accountId, mailbox, page, pageSize));
    }

    if ((url.pathname === '/api/mails/fetch' || url.pathname === '/api/mails/fetch-new') && method === 'POST') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const adapter = new D1DatabaseAdapter(binding as D1DatabaseLike);
      const accounts = new AccountRepository(adapter);
      const cache = new MailCacheRepository(adapter);
      const body = await readJsonBody<{ account_id?: number; mailbox?: string; proxy_id?: number }>(request);
      const accountId = body.account_id || 0;
      const mailbox = body.mailbox || 'INBOX';
      const top = url.pathname === '/api/mails/fetch-new' ? 1 : 50;

      if (!accountId) {
        return Response.json({
          code: 400,
          data: null,
          message: 'account_id is required',
        }, { status: 400 });
      }
      if (body.proxy_id) {
        return unsupported('Proxy-assisted mail fetch is not supported on Cloudflare runtime.');
      }

      const account = await accounts.getById(accountId);
      if (!account) {
        return Response.json({
          code: 404,
          data: null,
          message: 'Account not found',
        }, { status: 404 });
      }

      try {
        const token = await refreshGraphToken(account.client_id, account.refresh_token);
        await accounts.updateTokenRefreshTime(accountId, token.refresh_token);

        if (!token.has_mail_scope) {
          throw new Error('Mail.Read scope is missing');
        }

        const mails = await fetchGraphMails(token.access_token, mailbox, top);
        await cache.upsert(accountId, mailbox, mails);
        await accounts.updateSyncTime(accountId);

        const result: FetchMailsResult = {
          mails: mails as MailMessage[],
          total: mails.length,
          protocol: 'graph',
          cached: false,
        };

        if (url.pathname === '/api/mails/fetch-new') {
          return json(result.mails[0] || null);
        }

        return json(result);
      } catch (error) {
        await accounts.markError(accountId);
        const cached = await cache.getByAccount(accountId, mailbox, 1, top);

        if (url.pathname === '/api/mails/fetch-new') {
          return json(cached.list[0] || null);
        }

        return json({
          mails: cached.list,
          total: cached.total,
          protocol: 'graph',
          cached: true,
        } as FetchMailsResult);
      }
    }

    if (url.pathname === '/api/mails/clear' && method === 'DELETE') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const adapter = new D1DatabaseAdapter(binding as D1DatabaseLike);
      const accounts = new AccountRepository(adapter);
      const cache = new MailCacheRepository(adapter);
      const body = await readJsonBody<{ account_id?: number; mailbox?: string; proxy_id?: number }>(request);
      const accountId = body.account_id || 0;
      const mailbox = body.mailbox || 'INBOX';

      if (!accountId) {
        return Response.json({
          code: 400,
          data: null,
          message: 'account_id is required',
        }, { status: 400 });
      }
      if (body.proxy_id) {
        return unsupported('Proxy-assisted mailbox clearing is not supported on Cloudflare runtime.');
      }

      const account = await accounts.getById(accountId);
      if (!account) {
        return Response.json({
          code: 404,
          data: null,
          message: 'Account not found',
        }, { status: 404 });
      }

      const token = await refreshGraphToken(account.client_id, account.refresh_token);
      await accounts.updateTokenRefreshTime(accountId, token.refresh_token);
      await deleteAllGraphMails(token.access_token, mailbox);
      await cache.clearByAccount(accountId, mailbox);

      return json({ message: '邮件正在清空中...' });
    }

    if (url.pathname === '/api/accounts/import-confirm' && method === 'POST') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new AccountRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );
      const body = await readJsonBody<{
        content?: string;
        separator?: string;
        format?: string[];
        mode?: 'skip' | 'overwrite';
      }>(request);
      if (!body.content) {
        return Response.json({
          code: 400,
          data: null,
          message: 'content is required',
        }, { status: 400 });
      }
      if (body.mode !== 'skip' && body.mode !== 'overwrite') {
        return Response.json({
          code: 400,
          data: null,
          message: 'mode must be skip or overwrite',
        }, { status: 400 });
      }

      return json(await repository.importConfirm({
        content: body.content,
        separator: body.separator || '----',
        format: body.format || ['email', 'password', 'client_id', 'refresh_token'],
        mode: body.mode,
      }));
    }

    if (url.pathname === '/api/accounts/import' && method === 'POST') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new AccountRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );
      const body = await readJsonBody<{
        content?: string;
        separator?: string;
        format?: string[];
      }>(request);
      if (!body.content) {
        return Response.json({
          code: 400,
          data: null,
          message: 'content is required',
        }, { status: 400 });
      }

      return json(await repository.import({
        content: body.content,
        separator: body.separator || '----',
        format: body.format || ['email', 'password', 'client_id', 'refresh_token'],
      }));
    }

    if (url.pathname === '/api/accounts/export' && method === 'POST') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new AccountRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );
      const body = await readJsonBody<{
        ids?: number[];
        separator?: string;
        format?: string[];
      }>(request);

      return json(await repository.export({
        ids: body.ids,
        separator: body.separator,
        format: body.format,
      }));
    }

    if (url.pathname === '/api/tags' && method === 'GET') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new TagRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );

      return json(await repository.list());
    }

    if (url.pathname === '/api/tags' && method === 'POST') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new TagRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );
      const body = await readJsonBody<{ name?: string; color?: string }>(request);
      if (!body.name) {
        return Response.json({
          code: 400,
          data: null,
          message: 'name is required',
        }, { status: 400 });
      }

      return json(await repository.create(body.name, body.color));
    }

    const tagId = matchId(url.pathname, /^\/api\/tags\/(\d+)$/);
    if (tagId !== undefined) {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new TagRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );

      if (method === 'PUT') {
        const body = await readJsonBody<{ name?: string; color?: string }>(request);
        const updated = await repository.update(tagId, body);
        if (!updated) {
          return Response.json({
            code: 404,
            data: null,
            message: 'Tag not found',
          }, { status: 404 });
        }

        return json(updated);
      }

      if (method === 'DELETE') {
        const deleted = await repository.delete(tagId);
        if (!deleted) {
          return Response.json({
            code: 404,
            data: null,
            message: 'Tag not found',
          }, { status: 404 });
        }

        return json({ deleted: true });
      }
    }

    if (url.pathname === '/api/proxies' && method === 'GET') {
      const binding = env[config.db.binding];
      if (!binding) {
        return json({
          message: `D1 binding "${config.db.binding}" is not configured.`,
        }, 500);
      }

      const repository = new ProxyRepository(
        new D1DatabaseAdapter(binding as D1DatabaseLike)
      );

      return json(await repository.list());
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

    if (url.pathname.startsWith('/api/backup/')) {
      return unsupported('Backup is not supported on Cloudflare runtime.');
    }

    if (url.pathname.startsWith('/api/proxies') && method !== 'GET') {
      return unsupported(proxyManagementUnsupportedMessage);
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
