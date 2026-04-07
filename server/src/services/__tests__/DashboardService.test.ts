import test from 'node:test';
import assert from 'node:assert/strict';
import type { AccountWithTags, MailMessage, Proxy } from '../../types';
import { DashboardService } from '../DashboardService';

function createAccount(id: number, overrides: Partial<AccountWithTags> = {}): AccountWithTags {
  return {
    id,
    email: `user-${id}@outlook.com`,
    password: '',
    client_id: `client-${id}`,
    refresh_token: `refresh-${id}`,
    remark: '',
    status: 'active',
    last_synced_at: null,
    token_refreshed_at: null,
    created_at: '2026-04-05T00:00:00.000Z',
    updated_at: '2026-04-05T00:00:00.000Z',
    tags: [],
    ...overrides,
  };
}

function createProxy(id: number, status: Proxy['status']): Proxy {
  return {
    id,
    name: `proxy-${id}`,
    type: 'http',
    host: '127.0.0.1',
    port: 8080,
    username: '',
    password: '',
    is_default: id === 1,
    last_tested_at: null,
    last_test_ip: '',
    status,
    created_at: '2026-04-05T00:00:00.000Z',
  };
}

test('DashboardService.getStats supports async account repository', async () => {
  const recentMails: MailMessage[] = [];
  const service = new DashboardService({
    accountReader: {
      getAll: async () => [
        createAccount(1, { token_refreshed_at: '2026-01-01T00:00:00.000Z' }),
        createAccount(2, { status: 'error' }),
      ],
    },
    cacheReader: {
      getRecent: async () => recentMails,
      countByAccount: async (accountId: number, mailbox: string) => accountId === 1 && mailbox === 'INBOX' ? 3 : 0,
      countAll: async (mailbox: string) => mailbox === 'INBOX' ? 3 : 1,
    },
    proxyReader: {
      list: async () => [createProxy(1, 'active'), createProxy(2, 'failed')],
    },
  });

  const stats = await service.getStats();

  assert.equal(stats.totalAccounts, 2);
  assert.equal(stats.activeAccounts, 1);
  assert.equal(stats.errorAccounts, 1);
  assert.equal(stats.expiringTokens, 1);
  assert.equal(stats.unusedAccounts, 1);
  assert.equal(stats.totalInboxMails, 3);
  assert.equal(stats.totalJunkMails, 1);
  assert.equal(stats.totalProxies, 2);
  assert.equal(stats.activeProxies, 1);
  assert.deepEqual(stats.accountStats, [
    { account_id: 1, email: 'user-1@outlook.com', inbox_count: 3, junk_count: 0 },
    { account_id: 2, email: 'user-2@outlook.com', inbox_count: 0, junk_count: 0 },
  ]);
});
