import type { Account, AccountWithTags, PaginatedResponse, Tag } from '../types';
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
}
