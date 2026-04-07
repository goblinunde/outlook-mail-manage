export type AppRuntime = 'node' | 'cloudflare';
export type DatabaseProvider = 'sqlite' | 'd1';

export interface RuntimeConfig {
  runtime: AppRuntime;
  port: number;
  logLevel: string;
  accessPassword: string;
  db: {
    provider: DatabaseProvider;
    path: string;
    binding: string;
  };
}

interface ResolveRuntimeConfigInput {
  runtime?: AppRuntime;
  env?: Record<string, string | undefined>;
}

function inferRuntime(env: Record<string, string | undefined>): AppRuntime {
  if (env.CLOUDFLARE === 'true' || env.WORKERS_RS === 'true' || env.CF_PAGES === '1') {
    return 'cloudflare';
  }

  return 'node';
}

function normalizeDatabaseProvider(
  value: string | undefined,
  runtime: AppRuntime
): DatabaseProvider {
  if (value === 'sqlite' || value === 'd1') {
    return value;
  }

  return runtime === 'cloudflare' ? 'd1' : 'sqlite';
}

export function resolveRuntimeConfig(input: ResolveRuntimeConfigInput = {}): RuntimeConfig {
  const env = input.env ?? {};
  const runtime = input.runtime ?? inferRuntime(env);
  const dbProvider = normalizeDatabaseProvider(env.DB_PROVIDER, runtime);

  return {
    runtime,
    port: parseInt(env.PORT || '3000', 10),
    logLevel: env.LOG_LEVEL || 'info',
    accessPassword: env.ACCESS_PASSWORD || '',
    db: {
      provider: dbProvider,
      path: env.DB_PATH || './data/outlook.db',
      binding: env.D1_DATABASE_BINDING || 'DB',
    },
  };
}
