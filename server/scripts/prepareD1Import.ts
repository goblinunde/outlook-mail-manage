import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../src/config';
import { createD1ImportChunks, type D1ImportDataset, type D1ImportTable } from '../src/cloudflare/d1Import';
import { ensureDir, formatTimestamp, getRepoRoot, parseArgs, resolveFlexiblePath, resolveOutputPath } from './cloudflareScriptUtils';

const TABLE_SELECTS: Record<D1ImportTable, string> = {
  accounts: 'SELECT * FROM accounts ORDER BY id ASC',
  proxies: 'SELECT * FROM proxies ORDER BY id ASC',
  tags: 'SELECT * FROM tags ORDER BY id ASC',
  account_tags: 'SELECT * FROM account_tags ORDER BY account_id ASC, tag_id ASC',
  mail_cache: 'SELECT * FROM mail_cache ORDER BY id ASC',
};

function resolveSqlitePath(rawPath?: string): string {
  if (!rawPath) {
    return config.dbPath;
  }

  return resolveFlexiblePath(getRepoRoot(), rawPath);
}

function readDataset(dbPath: string): D1ImportDataset {
  const db = new Database(dbPath, { readonly: true });

  try {
    return {
      accounts: db.prepare(TABLE_SELECTS.accounts).all() as Record<string, unknown>[],
      proxies: db.prepare(TABLE_SELECTS.proxies).all() as Record<string, unknown>[],
      tags: db.prepare(TABLE_SELECTS.tags).all() as Record<string, unknown>[],
      account_tags: db.prepare(TABLE_SELECTS.account_tags).all() as Record<string, unknown>[],
      mail_cache: db.prepare(TABLE_SELECTS.mail_cache).all() as Record<string, unknown>[],
    };
  } finally {
    db.close();
  }
}

function writeChunks(outputDir: string, chunks: string[]): string[] {
  return chunks.map((chunk, index) => {
    const filename = `${String(index + 1).padStart(3, '0')}.sql`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, chunk, 'utf8');
    return filepath;
  });
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const sqlitePath = resolveSqlitePath(typeof args.db === 'string' ? args.db : undefined);
  const baseOutputDir = resolveOutputPath(
    getRepoRoot(),
    typeof args.out === 'string' ? args.out : '.wrangler/d1-import'
  );
  const maxStatements = typeof args['max-statements'] === 'string'
    ? Number.parseInt(args['max-statements'], 10)
    : 250;

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found: ${sqlitePath}`);
  }

  const dataset = readDataset(sqlitePath);
  const chunks = createD1ImportChunks(dataset, maxStatements);
  const outputDir = path.join(baseOutputDir, formatTimestamp());

  ensureDir(outputDir);
  const files = writeChunks(outputDir, chunks);

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceSqlitePath: sqlitePath,
    outputDir,
    maxStatementsPerChunk: maxStatements,
    fileCount: files.length,
    rowCounts: {
      accounts: dataset.accounts.length,
      proxies: dataset.proxies.length,
      tags: dataset.tags.length,
      account_tags: dataset.account_tags.length,
      mail_cache: dataset.mail_cache.length,
    },
    files: files.map((file) => path.basename(file)),
  };

  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(`Prepared D1 import bundle from ${sqlitePath}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`SQL chunk files: ${files.length}`);
}

main();
