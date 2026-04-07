import type { DatabaseAdapter, ExecuteResult } from './types';

interface D1Meta {
  changes?: number;
  last_row_id?: number | string;
}

interface D1RunResult {
  meta?: D1Meta;
}

interface D1AllResult<T> {
  results?: T[];
}

interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1AllResult<T>>;
  run(): Promise<D1RunResult>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatement;
}

export class D1DatabaseAdapter implements DatabaseAdapter {
  constructor(private readonly db: D1DatabaseLike) {}

  async first<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.db.prepare(sql).bind(...params).first<T>();
    return result ?? undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.db.prepare(sql).bind(...params).all<T>();
    return result.results || [];
  }

  async run(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const result = await this.db.prepare(sql).bind(...params).run();

    return {
      changes: result.meta?.changes ?? 0,
      lastInsertRowid: result.meta?.last_row_id,
    };
  }
}
