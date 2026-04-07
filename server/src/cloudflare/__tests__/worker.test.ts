import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker';

interface AccountRow {
  id: number;
  email: string;
  password: string;
  client_id: string;
  refresh_token: string;
  remark: string;
  status: 'active' | 'inactive' | 'error';
  last_synced_at: string | null;
  token_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TagRow {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

interface ProxyRow {
  id: number;
  name: string;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username: string;
  password: string;
  is_default: number;
  last_tested_at: string | null;
  last_test_ip: string;
  status: 'untested' | 'active' | 'failed';
  created_at: string;
}

interface MailCacheRow {
  id: number;
  account_id: number;
  mailbox: 'INBOX' | 'Junk';
  mail_id: string;
  sender: string;
  sender_name: string;
  subject: string;
  text_content: string;
  html_content: string;
  mail_date: string;
  is_read: number;
  cached_at: string;
}

class FakeD1PreparedStatement {
  private boundParams: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly accounts: AccountRow[],
    private readonly tagsByAccountId: Record<number, TagRow[]>,
    private readonly proxies: ProxyRow[],
    private readonly mails: MailCacheRow[]
  ) {}

  bind(...params: unknown[]) {
    this.boundParams = params;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('SELECT COUNT(*) as c FROM accounts')) {
      return { c: this.filterAccounts().length } as T;
    }

    if (this.sql.includes('SELECT * FROM accounts WHERE id = ?')) {
      const accountId = Number(this.boundParams[0]);
      return (this.accounts.find((account) => account.id === accountId) || null) as T | null;
    }

    if (this.sql.includes('SELECT COUNT(*) as c FROM mail_cache WHERE account_id = ? AND mailbox = ?')) {
      const accountId = Number(this.boundParams[0]);
      const mailbox = String(this.boundParams[1]);
      return {
        c: this.mails.filter((mail) => mail.account_id === accountId && mail.mailbox === mailbox).length,
      } as T;
    }

    if (this.sql.includes('SELECT COUNT(*) as c FROM mail_cache WHERE mailbox = ?')) {
      const mailbox = String(this.boundParams[0]);
      return {
        c: this.mails.filter((mail) => mail.mailbox === mailbox).length,
      } as T;
    }

    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes('SELECT * FROM accounts')) {
      const search = typeof this.boundParams[0] === 'string' ? this.boundParams[0] : undefined;
      const pageSize = Number(this.boundParams[search ? 1 : 0] ?? this.accounts.length);
      const offset = Number(this.boundParams[search ? 2 : 1] ?? 0);

      return {
        results: this
          .filterAccounts(search)
          .sort((a, b) => b.id - a.id)
          .slice(offset, offset + pageSize) as T[],
      };
    }

    if (this.sql.includes('FROM tags t') && this.sql.includes('WHERE at.account_id = ?')) {
      const accountId = Number(this.boundParams[0]);
      return { results: (this.tagsByAccountId[accountId] || []) as T[] };
    }

    if (this.sql.includes('SELECT * FROM proxies ORDER BY id DESC')) {
      return {
        results: [...this.proxies].sort((a, b) => b.id - a.id) as T[],
      };
    }

    if (this.sql.includes('SELECT mc.*, a.email as account_email FROM mail_cache mc JOIN accounts a ON mc.account_id = a.id')) {
      const limit = Number(this.boundParams[0] ?? 5);
      return {
        results: [...this.mails]
          .sort((a, b) => b.mail_date.localeCompare(a.mail_date))
          .slice(0, limit) as T[],
      };
    }

    return { results: [] };
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    return {
      meta: {
        changes: 0,
        last_row_id: 0,
      },
    };
  }

  private filterAccounts(searchParam?: string): AccountRow[] {
    const rawSearch = searchParam ?? (typeof this.boundParams[0] === 'string' ? this.boundParams[0] : undefined);
    const keyword = rawSearch?.replaceAll('%', '').toLowerCase();
    if (!keyword) {
      return [...this.accounts];
    }

    return this.accounts.filter((account) => account.email.toLowerCase().includes(keyword));
  }
}

class FakeD1Database {
  constructor(
    private readonly accounts: AccountRow[],
    private readonly tagsByAccountId: Record<number, TagRow[]>,
    private readonly proxies: ProxyRow[] = [],
    private readonly mails: MailCacheRow[] = []
  ) {}

  prepare(sql: string) {
    return new FakeD1PreparedStatement(sql, this.accounts, this.tagsByAccountId, this.proxies, this.mails);
  }
}

test('cloudflare worker serves account list from D1 adapter', async () => {
  const response = await worker.fetch(
    { url: 'https://example.com/api/accounts?page=1&pageSize=2&search=alpha' },
    {
      DB: new FakeD1Database(
        [
          {
            id: 1,
            email: 'alpha@outlook.com',
            password: '',
            client_id: 'client-1',
            refresh_token: 'refresh-1',
            remark: '',
            status: 'active',
            last_synced_at: null,
            token_refreshed_at: null,
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 2,
            email: 'beta@outlook.com',
            password: '',
            client_id: 'client-2',
            refresh_token: 'refresh-2',
            remark: '',
            status: 'active',
            last_synced_at: null,
            token_refreshed_at: null,
            created_at: '2026-04-02T00:00:00.000Z',
            updated_at: '2026-04-02T00:00:00.000Z',
          },
          {
            id: 3,
            email: 'team-alpha@outlook.com',
            password: '',
            client_id: 'client-3',
            refresh_token: 'refresh-3',
            remark: '',
            status: 'error',
            last_synced_at: null,
            token_refreshed_at: null,
            created_at: '2026-04-03T00:00:00.000Z',
            updated_at: '2026-04-03T00:00:00.000Z',
          },
        ],
        {
          3: [{ id: 30, name: 'VIP', color: '#ff0000', created_at: '2026-04-03T00:00:00.000Z' }],
          1: [{ id: 10, name: 'Seed', color: '#00ff00', created_at: '2026-04-01T00:00:00.000Z' }],
        }
      ),
    }
  ) as { json(): Promise<{ code: number; data: { total: number; list: Array<{ id: number; email: string; tags: Array<{ name: string }> }> } }> };

  const body = await response.json();

  assert.equal(body.code, 200);
  assert.equal(body.data.total, 2);
  assert.deepEqual(
    body.data.list.map((account) => ({
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

test('cloudflare worker serves dashboard stats from D1 adapter', async () => {
  const response = await worker.fetch(
    { url: 'https://example.com/api/dashboard/stats' },
    {
      DB: new FakeD1Database(
        [
          {
            id: 1,
            email: 'alpha@outlook.com',
            password: '',
            client_id: 'client-1',
            refresh_token: 'refresh-1',
            remark: '',
            status: 'active',
            last_synced_at: null,
            token_refreshed_at: '2026-01-01T00:00:00.000Z',
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 2,
            email: 'beta@outlook.com',
            password: '',
            client_id: 'client-2',
            refresh_token: 'refresh-2',
            remark: '',
            status: 'error',
            last_synced_at: null,
            token_refreshed_at: null,
            created_at: '2026-04-02T00:00:00.000Z',
            updated_at: '2026-04-02T00:00:00.000Z',
          },
        ],
        {
          1: [{ id: 10, name: 'Seed', color: '#00ff00', created_at: '2026-04-01T00:00:00.000Z' }],
        },
        [
          {
            id: 1,
            name: 'proxy-1',
            type: 'http',
            host: '127.0.0.1',
            port: 8080,
            username: '',
            password: '',
            is_default: 1,
            last_tested_at: null,
            last_test_ip: '',
            status: 'active',
            created_at: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 2,
            name: 'proxy-2',
            type: 'socks5',
            host: '127.0.0.2',
            port: 1080,
            username: '',
            password: '',
            is_default: 0,
            last_tested_at: null,
            last_test_ip: '',
            status: 'failed',
            created_at: '2026-04-02T00:00:00.000Z',
          },
        ],
        [
          {
            id: 1,
            account_id: 1,
            mailbox: 'INBOX',
            mail_id: 'm-1',
            sender: 'a@test.com',
            sender_name: 'A',
            subject: 'Inbox 1',
            text_content: '',
            html_content: '',
            mail_date: '2026-04-04T00:00:00.000Z',
            is_read: 0,
            cached_at: '2026-04-04T00:00:00.000Z',
          },
          {
            id: 2,
            account_id: 1,
            mailbox: 'INBOX',
            mail_id: 'm-2',
            sender: 'b@test.com',
            sender_name: 'B',
            subject: 'Inbox 2',
            text_content: '',
            html_content: '',
            mail_date: '2026-04-03T00:00:00.000Z',
            is_read: 0,
            cached_at: '2026-04-03T00:00:00.000Z',
          },
          {
            id: 3,
            account_id: 2,
            mailbox: 'Junk',
            mail_id: 'm-3',
            sender: 'c@test.com',
            sender_name: 'C',
            subject: 'Junk 1',
            text_content: '',
            html_content: '',
            mail_date: '2026-04-02T00:00:00.000Z',
            is_read: 0,
            cached_at: '2026-04-02T00:00:00.000Z',
          },
        ]
      ),
    }
  ) as { json(): Promise<{ code: number; data: { totalAccounts: number; activeAccounts: number; totalInboxMails: number; totalJunkMails: number; totalProxies: number; activeProxies: number; expiringTokens: number; errorAccounts: number; unusedAccounts: number; accountStats: Array<{ account_id: number; inbox_count: number; junk_count: number }> } }> };

  const body = await response.json();

  assert.equal(body.code, 200);
  assert.equal(body.data.totalAccounts, 2);
  assert.equal(body.data.activeAccounts, 1);
  assert.equal(body.data.totalInboxMails, 2);
  assert.equal(body.data.totalJunkMails, 1);
  assert.equal(body.data.totalProxies, 2);
  assert.equal(body.data.activeProxies, 1);
  assert.equal(body.data.expiringTokens, 1);
  assert.equal(body.data.errorAccounts, 1);
  assert.equal(body.data.unusedAccounts, 1);
  assert.deepEqual(body.data.accountStats, [
    { account_id: 2, email: 'beta@outlook.com', inbox_count: 0, junk_count: 1 },
    { account_id: 1, email: 'alpha@outlook.com', inbox_count: 2, junk_count: 0 },
  ]);
});

test('cloudflare worker exposes runtime capabilities', async () => {
  const response = await worker.fetch(
    { url: 'https://example.com/api/runtime/capabilities' },
    { DB: {} }
  ) as { json(): Promise<{ code: number; data: { runtime: string; features: Record<string, boolean> } }> };

  const body = await response.json();

  assert.equal(body.code, 200);
  assert.equal(body.data.runtime, 'cloudflare');
  assert.equal(body.data.features.proxyAgents, false);
  assert.equal(body.data.features.imap, false);
  assert.equal(body.data.features.fileBackup, false);
  assert.equal(body.data.features.d1, true);
  assert.equal(body.data.features.sqlite, false);
});

test('cloudflare worker delegates non-api requests to static assets binding', async () => {
  let requestedUrl = '';

  const response = await worker.fetch(
    { url: 'https://example.com/accounts' },
    {
      DB: {},
      ASSETS: {
        fetch(request: Request) {
          requestedUrl = request.url;
          return Promise.resolve(new Response('<html>ok</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }));
        },
      },
    }
  ) as Response;

  assert.equal(response.status, 200);
  assert.equal(requestedUrl, 'https://example.com/accounts');
  assert.equal(await response.text(), '<html>ok</html>');
});
