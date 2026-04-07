export interface ExecuteResult {
  changes: number;
  lastInsertRowid?: number | string;
}

export interface DatabaseAdapter {
  first<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<ExecuteResult>;
}
