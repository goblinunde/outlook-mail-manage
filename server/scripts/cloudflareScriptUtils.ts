import fs from 'fs';
import path from 'path';

export interface WranglerD1Database {
  binding: string;
  database_name: string;
  database_id: string;
  migrations_dir?: string;
}

export interface WranglerConfig {
  d1_databases?: WranglerD1Database[];
}

export function getRepoRoot(): string {
  return path.resolve(__dirname, '../..');
}

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[rawKey] = true;
      continue;
    }

    args[rawKey] = next;
    index += 1;
  }

  return args;
}

function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

export function readWranglerConfig(configPath?: string): WranglerConfig {
  const targetPath = configPath
    ? path.resolve(configPath)
    : path.join(getRepoRoot(), 'wrangler.jsonc');
  const content = fs.readFileSync(targetPath, 'utf8');
  return JSON.parse(stripJsonComments(content)) as WranglerConfig;
}

export function resolveD1DatabaseName(args: Record<string, string | boolean>): string {
  const explicit = args.database;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }

  const config = readWranglerConfig(typeof args.config === 'string' ? args.config : undefined);
  const databaseName = config.d1_databases?.[0]?.database_name;
  if (!databaseName) {
    throw new Error('No D1 database_name found in wrangler.jsonc. Pass --database explicitly.');
  }

  return databaseName;
}

export function formatTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function resolveFlexiblePath(baseRoot: string, rawPath: string): string {
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  const repoRelative = path.resolve(baseRoot, rawPath);
  if (fs.existsSync(repoRelative)) {
    return repoRelative;
  }

  return path.resolve(process.cwd(), rawPath);
}

export function resolveOutputPath(baseRoot: string, rawPath: string): string {
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(baseRoot, rawPath);
}
