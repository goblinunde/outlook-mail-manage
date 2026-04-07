import test from 'node:test';
import assert from 'node:assert/strict';
import type { Account, Tag } from '../../types';
import type { DatabaseAdapter, ExecuteResult } from '../../database/types';
import { AccountRepository } from '../AccountRepository';

class FakeDatabaseAdapter implements DatabaseAdapter {
  constructor(
    private readonly accounts: Account[],
    private readonly tagsByAccountId: Record<number, Tag[]>
  ) {}

  async first<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    if (sql.includes('SELECT COUNT(*) as c FROM accounts')) {
      const filtered = this.filterAccounts(params[0] as string | undefined);
      return { c: filtered.length } as T;
    }

    if (sql.includes('SELECT * FROM accounts WHERE id = ?')) {
      return this.accounts.find((account) => account.id === params[0]) as T | undefined;
    }

    throw new Error(`Unhandled first query: ${sql}`);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (sql.includes('SELECT * FROM accounts')) {
      const search = typeof params[0] === 'string' ? params[0] : undefined;
      const pageSize = Number(params[search ? 1 : 0] ?? this.accounts.length);
      const offset = Number(params[search ? 2 : 1] ?? 0);
      return this
        .filterAccounts(search)
        .sort((a, b) => b.id - a.id)
        .slice(offset, offset + pageSize) as T[];
    }

    if (sql.includes('FROM tags t') && sql.includes('WHERE at.account_id = ?')) {
      const accountId = Number(params[0]);
      return (this.tagsByAccountId[accountId] || []) as T[];
    }

    throw new Error(`Unhandled all query: ${sql}`);
  }

  async run(_sql: string, _params: unknown[] = []): Promise<ExecuteResult> {
    throw new Error('Not implemented in test adapter');
  }

  private filterAccounts(search: string | undefined): Account[] {
    const keyword = search?.replaceAll('%', '').toLowerCase();
    if (!keyword) {
      return [...this.accounts];
    }

    return this.accounts.filter((account) => account.email.toLowerCase().includes(keyword));
  }
}

function createAccount(id: number, email: string): Account {
  return {
    id,
    email,
    password: '',
    client_id: `client-${id}`,
    refresh_token: `refresh-${id}`,
    remark: '',
    status: 'active',
    last_synced_at: null,
    token_refreshed_at: null,
    created_at: `2026-04-0${id}T00:00:00.000Z`,
    updated_at: `2026-04-0${id}T00:00:00.000Z`,
  };
}

test('AccountRepository.list keeps pagination, search, and tags', async () => {
  const repository = new AccountRepository(new FakeDatabaseAdapter(
    [
      createAccount(1, 'alpha@outlook.com'),
      createAccount(2, 'beta@outlook.com'),
      createAccount(3, 'team-alpha@outlook.com'),
    ],
    {
      3: [{ id: 30, name: 'VIP', color: '#ff0000', created_at: '2026-04-03T00:00:00.000Z' }],
      1: [{ id: 10, name: 'Seed', color: '#00ff00', created_at: '2026-04-01T00:00:00.000Z' }],
    }
  ));

  const result = await repository.list(1, 2, 'alpha');

  assert.equal(result.total, 2);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 2);
  assert.deepEqual(
    result.list.map((account) => ({
      id: account.id,
      email: account.email,
      tags: account.tags.map((tag) => tag.name),
    })),
    [
      { id: 3, email: 'team-alpha@outlook.com', tags: ['VIP'] },
      { id: 1, email: 'alpha@outlook.com', tags: ['Seed'] },
    ]
  );
});

test('AccountRepository.getById returns account with tags', async () => {
  const repository = new AccountRepository(new FakeDatabaseAdapter(
    [createAccount(5, 'focus@outlook.com')],
    {
      5: [{ id: 50, name: 'Focus', color: '#0000ff', created_at: '2026-04-05T00:00:00.000Z' }],
    }
  ));

  const account = await repository.getById(5);

  assert.equal(account?.email, 'focus@outlook.com');
  assert.deepEqual(account?.tags.map((tag) => tag.name), ['Focus']);
});
