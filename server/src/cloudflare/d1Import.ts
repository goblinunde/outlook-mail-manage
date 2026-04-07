export type D1ImportTable = 'accounts' | 'proxies' | 'tags' | 'account_tags' | 'mail_cache';

export type D1ImportRow = Record<string, unknown>;

export interface D1ImportDataset {
  accounts: D1ImportRow[];
  proxies: D1ImportRow[];
  tags: D1ImportRow[];
  account_tags: D1ImportRow[];
  mail_cache: D1ImportRow[];
}

const DELETE_ORDER: D1ImportTable[] = ['account_tags', 'mail_cache', 'proxies', 'tags', 'accounts'];
const INSERT_ORDER: D1ImportTable[] = ['accounts', 'proxies', 'tags', 'account_tags', 'mail_cache'];

function serializeSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  const normalized = String(value).replace(/'/g, "''");
  return `'${normalized}'`;
}

function buildInsertStatement(table: D1ImportTable, row: D1ImportRow): string {
  const columns = Object.keys(row);
  const values = columns.map((column) => serializeSqlValue(row[column]));
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

export function renderD1ImportStatements(dataset: D1ImportDataset): string[] {
  const statements: string[] = [];

  for (const table of DELETE_ORDER) {
    statements.push(`DELETE FROM ${table};`);
  }

  for (const table of INSERT_ORDER) {
    for (const row of dataset[table]) {
      statements.push(buildInsertStatement(table, row));
    }
  }

  return statements;
}

function wrapStatements(statements: string[]): string {
  return [
    'PRAGMA defer_foreign_keys = true;',
    'BEGIN TRANSACTION;',
    ...statements,
    'COMMIT;',
    '',
  ].join('\n');
}

export function createD1ImportChunks(dataset: D1ImportDataset, maxStatementsPerChunk = 250): string[] {
  const statements = renderD1ImportStatements(dataset);
  const chunkSize = Math.max(1, Math.floor(maxStatementsPerChunk));
  const chunks: string[] = [];

  for (let index = 0; index < statements.length; index += chunkSize) {
    chunks.push(wrapStatements(statements.slice(index, index + chunkSize)));
  }

  return chunks;
}
