import type { Proxy } from '../types';
import type { DatabaseAdapter } from '../database/types';

export class ProxyRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  async list(): Promise<Proxy[]> {
    return this.db.all<Proxy>('SELECT * FROM proxies ORDER BY id DESC');
  }
}
