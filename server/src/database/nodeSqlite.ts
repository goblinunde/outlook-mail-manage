import type { Database as DatabaseType } from 'better-sqlite3';
import type { DatabaseAdapter, ExecuteResult } from './types';

function normalizeRowId(value: number | bigint): number | string {
  return typeof value === 'bigint' ? value.toString() : value;
}

export class NodeSqliteDatabaseAdapter implements DatabaseAdapter {
  constructor(private readonly db: DatabaseType) {}

  async first<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const result = this.db.prepare(sql).run(...params);

    return {
      changes: result.changes,
      lastInsertRowid: normalizeRowId(result.lastInsertRowid),
    };
  }
}
