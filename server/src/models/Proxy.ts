import db from '../database';
import { Proxy } from '../types';

export class ProxyModel {
  list(): Proxy[] {
    return db.prepare('SELECT * FROM proxies ORDER BY is_default DESC, id DESC').all() as Proxy[];
  }

  getById(id: number): Proxy | undefined {
    return db.prepare('SELECT * FROM proxies WHERE id = ?').get(id) as Proxy | undefined;
  }

  getDefault(): Proxy | undefined {
    return db.prepare('SELECT * FROM proxies WHERE is_default = 1 LIMIT 1').get() as Proxy | undefined;
  }

  create(data: Partial<Proxy>): Proxy {
    const stmt = db.prepare('INSERT INTO proxies (name, provider, type, host, port, username, password, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const createProxy = db.transaction((payload: Partial<Proxy>) => {
      if (payload.is_default) {
        db.prepare('UPDATE proxies SET is_default = 0').run();
      }
      const result = stmt.run(
        payload.name || '',
        payload.provider || 'custom',
        payload.type,
        payload.host,
        payload.port,
        payload.username || '',
        payload.password || '',
        payload.is_default ? 1 : 0
      );
      return this.getById(result.lastInsertRowid as number)!;
    });
    return createProxy(data);
  }

  update(id: number, data: Partial<Proxy>): Proxy | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (['name', 'provider', 'type', 'host', 'port', 'username', 'password', 'is_default'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'is_default' ? (val ? 1 : 0) : val);
      }
    }
    if (fields.length === 0) return this.getById(id);
    const updateProxy = db.transaction((payload: any[]) => {
      if (data.is_default) {
        db.prepare('UPDATE proxies SET is_default = 0 WHERE id != ?').run(id);
      }
      payload.push(id);
      db.prepare(`UPDATE proxies SET ${fields.join(', ')} WHERE id = ?`).run(...payload);
      return this.getById(id);
    });
    return updateProxy(values);
  }

  delete(id: number): boolean {
    return db.prepare('DELETE FROM proxies WHERE id = ?').run(id).changes > 0;
  }

  setDefault(id: number): Proxy | undefined {
    db.prepare('UPDATE proxies SET is_default = 0').run();
    db.prepare('UPDATE proxies SET is_default = 1 WHERE id = ?').run(id);
    return this.getById(id);
  }

  updateTestResult(id: number, ip: string, status: 'active' | 'failed') {
    db.prepare('UPDATE proxies SET last_tested_at = CURRENT_TIMESTAMP, last_test_ip = ?, status = ? WHERE id = ?').run(ip, status, id);
  }
}
