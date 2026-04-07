import type { Account, AccountWithTags, ExportRequest, ImportPreviewResult, ImportRequest, ImportResult, PaginatedResponse, Tag } from '../types';
import type { DatabaseAdapter } from '../database/types';

export class AccountRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  async list(page = 1, pageSize = 20, search = ''): Promise<PaginatedResponse<AccountWithTags>> {
    const offset = (page - 1) * pageSize;
    const { where, params } = this.buildSearch(search);

    const totalRow = await this.db.first<{ c: number }>(
      `SELECT COUNT(*) as c FROM accounts ${where}`,
      params
    );

    const accounts = await this.db.all<Account>(
      `SELECT * FROM accounts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return {
      list: await this.attachTags(accounts),
      total: totalRow?.c ?? 0,
      page,
      pageSize,
    };
  }

  async getById(id: number): Promise<AccountWithTags | undefined> {
    const account = await this.db.first<Account>(
      'SELECT * FROM accounts WHERE id = ?',
      [id]
    );

    if (!account) {
      return undefined;
    }

    return this.attachTags([account]).then((accounts) => accounts[0]);
  }

  async getAll(): Promise<AccountWithTags[]> {
    const accounts = await this.db.all<Account>(
      'SELECT * FROM accounts ORDER BY id DESC'
    );

    return this.attachTags(accounts);
  }

  async create(data: Partial<Account>): Promise<AccountWithTags> {
    const result = await this.db.run(
      'INSERT INTO accounts (email, password, client_id, refresh_token, remark) VALUES (?, ?, ?, ?, ?)',
      [
        data.email || '',
        data.password || '',
        data.client_id || '',
        data.refresh_token || '',
        data.remark || '',
      ]
    );

    const created = await this.getById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('Account creation failed');
    }

    return created;
  }

  async update(id: number, data: Partial<Account>): Promise<AccountWithTags | undefined> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(data)) {
      if (['email', 'password', 'client_id', 'refresh_token', 'remark', 'status', 'token_refreshed_at'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const result = await this.db.run(
      `UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (result.changes === 0) {
      return undefined;
    }

    return this.getById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM accounts WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  async batchDelete(ids: number[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const placeholders = ids.map(() => '?').join(',');
    const result = await this.db.run(
      `DELETE FROM accounts WHERE id IN (${placeholders})`,
      ids
    );

    return result.changes;
  }

  async setTags(accountId: number, tagIds: number[]): Promise<void> {
    await this.db.run(
      'DELETE FROM account_tags WHERE account_id = ?',
      [accountId]
    );

    for (const tagId of tagIds) {
      await this.db.run(
        'INSERT OR IGNORE INTO account_tags (account_id, tag_id) VALUES (?, ?)',
        [accountId, tagId]
      );
    }
  }

  async importPreview(req: ImportRequest): Promise<ImportPreviewResult> {
    const { content, separator = '----', format = ['email', 'password', 'client_id', 'refresh_token'] } = req;
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const newItems: ImportPreviewResult['newItems'] = [];
    const duplicates: ImportPreviewResult['duplicates'] = [];
    const errors: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const record = this.parseImportLine(lines[index], separator, format);
      if (!record.email || !record.client_id || !record.refresh_token) {
        errors.push(`Line ${index + 1}: missing required fields`);
        continue;
      }

      const item: ImportPreviewResult['newItems'][number] = {
        line: index + 1,
        email: record.email,
        ...record,
      };
      const existing = await this.findIdByEmail(record.email);
      if (existing) {
        duplicates.push(item);
      } else {
        newItems.push(item);
      }
    }

    return { newItems, duplicates, errors };
  }

  async importConfirm(req: ImportRequest & { mode: 'skip' | 'overwrite' }): Promise<ImportResult> {
    const { content, separator = '----', format = ['email', 'password', 'client_id', 'refresh_token'], mode } = req;
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const record = this.parseImportLine(lines[index], separator, format);
      if (!record.email || !record.client_id || !record.refresh_token) {
        errors.push(`Line ${index + 1}: missing required fields`);
        continue;
      }

      const existing = await this.findIdByEmail(record.email);
      if (existing) {
        if (mode === 'overwrite') {
          await this.update(existing, {
            password: record.password || '',
            client_id: record.client_id,
            refresh_token: record.refresh_token,
          });
          imported += 1;
        } else {
          skipped += 1;
        }
      } else {
        await this.create(record);
        imported += 1;
      }
    }

    return { imported, skipped, errors };
  }

  async import(req: ImportRequest): Promise<ImportResult> {
    const { content, separator = '----', format = ['email', 'password', 'client_id', 'refresh_token'] } = req;
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const record = this.parseImportLine(lines[index], separator, format);
      if (!record.email || !record.client_id || !record.refresh_token) {
        errors.push(`Line ${index + 1}: missing required fields`);
        continue;
      }

      const existing = await this.findIdByEmail(record.email);
      if (existing) {
        skipped += 1;
        continue;
      }

      await this.create(record);
      imported += 1;
    }

    return { imported, skipped, errors };
  }

  async export(req: ExportRequest): Promise<{ content: string; count: number }> {
    const separator = req.separator || '----';
    const format = req.format || ['email', 'password', 'client_id', 'refresh_token'];
    const accounts = req.ids?.length
      ? (await this.getAll()).filter((account) => req.ids?.includes(account.id))
      : await this.getAll();

    const content = accounts
      .map((account) => format.map((field) => String(((account as unknown) as Record<string, unknown>)[field] || '')).join(separator))
      .join('\n');

    return {
      content,
      count: accounts.length,
    };
  }

  async updateSyncTime(id: number): Promise<void> {
    await this.db.run(
      'UPDATE accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  async updateTokenRefreshTime(id: number, newRefreshToken?: string): Promise<void> {
    if (newRefreshToken) {
      await this.db.run(
        'UPDATE accounts SET token_refreshed_at = CURRENT_TIMESTAMP, refresh_token = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newRefreshToken, 'active', id]
      );
      return;
    }

    await this.db.run(
      'UPDATE accounts SET token_refreshed_at = CURRENT_TIMESTAMP, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['active', id]
    );
  }

  async markError(id: number): Promise<void> {
    await this.db.run(
      'UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['error', id]
    );
  }

  private buildSearch(search: string): { where: string; params: unknown[] } {
    if (!search) {
      return { where: '', params: [] };
    }

    return {
      where: 'WHERE email LIKE ?',
      params: [`%${search}%`],
    };
  }

  private async attachTags(accounts: Account[]): Promise<AccountWithTags[]> {
    return Promise.all(accounts.map(async (account) => ({
      ...account,
      tags: await this.getTagsByAccountId(account.id),
    })));
  }

  private async getTagsByAccountId(accountId: number): Promise<Tag[]> {
    return this.db.all<Tag>(`
      SELECT t.* FROM tags t
      JOIN account_tags at ON t.id = at.tag_id
      WHERE at.account_id = ?
      ORDER BY t.name
    `, [accountId]);
  }

  private parseImportLine(line: string, separator: string, format: string[]): Partial<Account> {
    const parts = line.split(separator);
    const record: Record<string, string> = {};
    format.forEach((field, index) => {
      record[field] = (parts[index] || '').trim();
    });

    return record as Partial<Account>;
  }

  private async findIdByEmail(email: string): Promise<number | undefined> {
    const row = await this.db.first<{ id: number }>(
      'SELECT id FROM accounts WHERE email = ?',
      [email]
    );

    return row?.id;
  }
}
