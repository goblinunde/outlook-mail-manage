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
  provider: 'custom' | 'cloudflare-warp';
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

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setAccountField(account: AccountRow, key: string, value: unknown) {
  switch (key) {
    case 'email':
      account.email = String(value ?? '');
      break;
    case 'password':
      account.password = String(value ?? '');
      break;
    case 'client_id':
      account.client_id = String(value ?? '');
      break;
    case 'refresh_token':
      account.refresh_token = String(value ?? '');
      break;
    case 'remark':
      account.remark = String(value ?? '');
      break;
    case 'status':
      account.status = value as AccountRow['status'];
      break;
    case 'token_refreshed_at':
      account.token_refreshed_at = value ? String(value) : null;
      break;
  }
}

function setTagField(tag: TagRow, key: string, value: unknown) {
  switch (key) {
    case 'name':
      tag.name = String(value ?? '');
      break;
    case 'color':
      tag.color = String(value ?? '');
      break;
  }
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

    if (this.sql.includes('SELECT id FROM accounts WHERE email = ?')) {
      const email = String(this.boundParams[0]);
      const account = this.accounts.find((item) => item.email === email);
      return (account ? { id: account.id } : null) as T | null;
    }

    if (this.sql.includes('SELECT * FROM tags WHERE id = ?')) {
      const tagId = Number(this.boundParams[0]);
      return (
        Object.values(this.tagsByAccountId)
          .flat()
          .find((tag) => tag.id === tagId) || null
      ) as T | null;
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
      return {
        results: [...(this.tagsByAccountId[accountId] || [])]
          .sort((a, b) => a.name.localeCompare(b.name)) as T[],
      };
    }

    if (this.sql.includes('SELECT * FROM tags ORDER BY name')) {
      const uniqueTags = Array.from(
        new Map(
          Object.values(this.tagsByAccountId)
            .flat()
            .map((tag) => [tag.id, tag])
        ).values()
      );
      return {
        results: uniqueTags
          .sort((a, b) => a.name.localeCompare(b.name)) as T[],
      };
    }

    if (this.sql.includes('SELECT * FROM proxies ORDER BY is_default DESC, id DESC')) {
      return {
        results: [...this.proxies].sort((a, b) => {
          if (b.is_default !== a.is_default) {
            return b.is_default - a.is_default;
          }
          return b.id - a.id;
        }) as T[],
      };
    }

    if (this.sql.includes('SELECT * FROM mail_cache WHERE account_id = ? AND mailbox = ? ORDER BY mail_date DESC LIMIT ? OFFSET ?')) {
      const accountId = Number(this.boundParams[0]);
      const mailbox = String(this.boundParams[1]);
      const limit = Number(this.boundParams[2] ?? 50);
      const offset = Number(this.boundParams[3] ?? 0);
      return {
        results: this.mails
          .filter((mail) => mail.account_id === accountId && mail.mailbox === mailbox)
          .sort((a, b) => b.mail_date.localeCompare(a.mail_date))
          .slice(offset, offset + limit) as T[],
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
    if (this.sql.startsWith('INSERT INTO accounts')) {
      const nextId = (this.accounts.at(-1)?.id || 0) + 1;
      this.accounts.push({
        id: nextId,
        email: String(this.boundParams[0] || ''),
        password: String(this.boundParams[1] || ''),
        client_id: String(this.boundParams[2] || ''),
        refresh_token: String(this.boundParams[3] || ''),
        remark: String(this.boundParams[4] || ''),
        status: 'active',
        last_synced_at: null,
        token_refreshed_at: null,
        created_at: '2026-04-10T00:00:00.000Z',
        updated_at: '2026-04-10T00:00:00.000Z',
      });

      return {
        meta: { changes: 1, last_row_id: nextId },
      };
    }

    if (this.sql.startsWith('UPDATE accounts SET')) {
      const accountId = Number(this.boundParams.at(-1));
      const account = this.accounts.find((item) => item.id === accountId);
      if (!account) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }

      const fields = ['email', 'password', 'client_id', 'refresh_token', 'remark', 'status', 'token_refreshed_at'];
      const assignments = this.sql
        .replace('UPDATE accounts SET ', '')
        .replace(' WHERE id = ?', '')
        .split(', ')
        .filter((part) => !part.startsWith('updated_at'));

      assignments.forEach((assignment, index) => {
        const key = assignment.replace(' = ?', '');
        if (fields.includes(key)) {
          setAccountField(account, key, this.boundParams[index]);
        }
      });
      account.updated_at = '2026-04-10T00:00:00.000Z';

      return { meta: { changes: 1, last_row_id: accountId } };
    }

    if (this.sql.startsWith('UPDATE accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?')) {
      const accountId = Number(this.boundParams[0]);
      const account = this.accounts.find((item) => item.id === accountId);
      if (!account) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      account.last_synced_at = '2026-04-10T00:00:00.000Z';
      return { meta: { changes: 1, last_row_id: accountId } };
    }

    if (this.sql.startsWith('UPDATE accounts SET token_refreshed_at = CURRENT_TIMESTAMP')) {
      const accountId = Number(this.boundParams.at(-1));
      const account = this.accounts.find((item) => item.id === accountId);
      if (!account) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }

      if (this.sql.includes('refresh_token = ?')) {
        account.refresh_token = String(this.boundParams[0] || account.refresh_token);
      }
      if (this.sql.includes('status = ?')) {
        const statusIndex = this.sql.includes('refresh_token = ?') ? 1 : 0;
        account.status = this.boundParams[statusIndex] as AccountRow['status'];
      }
      account.token_refreshed_at = '2026-04-10T00:00:00.000Z';
      account.updated_at = '2026-04-10T00:00:00.000Z';

      return { meta: { changes: 1, last_row_id: accountId } };
    }

    if (this.sql.startsWith('UPDATE accounts SET status = ?')) {
      const accountId = Number(this.boundParams[1]);
      const account = this.accounts.find((item) => item.id === accountId);
      if (!account) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      account.status = this.boundParams[0] as AccountRow['status'];
      account.updated_at = '2026-04-10T00:00:00.000Z';
      return { meta: { changes: 1, last_row_id: accountId } };
    }

    if (this.sql.startsWith('DELETE FROM accounts WHERE id = ?')) {
      const accountId = Number(this.boundParams[0]);
      const before = this.accounts.length;
      const next = this.accounts.filter((item) => item.id !== accountId);
      this.accounts.splice(0, this.accounts.length, ...next);
      delete this.tagsByAccountId[accountId];

      return {
        meta: { changes: before - next.length, last_row_id: accountId },
      };
    }

    if (this.sql.startsWith('INSERT INTO tags')) {
      const existing = Object.values(this.tagsByAccountId).flat();
      const nextId = (existing.at(-1)?.id || 0) + 1;
      const tag: TagRow = {
        id: nextId,
        name: String(this.boundParams[0] || ''),
        color: String(this.boundParams[1] || '#3B82F6'),
        created_at: '2026-04-10T00:00:00.000Z',
      };

      if (!this.tagsByAccountId[0]) {
        this.tagsByAccountId[0] = [];
      }
      this.tagsByAccountId[0].push(tag);

      return { meta: { changes: 1, last_row_id: nextId } };
    }

    if (this.sql.startsWith('UPDATE tags SET')) {
      const tagId = Number(this.boundParams.at(-1));
      const tag = Object.values(this.tagsByAccountId)
        .flat()
        .find((item) => item.id === tagId);
      if (!tag) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }

      const assignments = this.sql
        .replace('UPDATE tags SET ', '')
        .replace(' WHERE id = ?', '')
        .split(', ');

      assignments.forEach((assignment, index) => {
        const key = assignment.replace(' = ?', '');
        setTagField(tag, key, this.boundParams[index]);
      });

      return { meta: { changes: 1, last_row_id: tagId } };
    }

    if (this.sql.startsWith('DELETE FROM tags WHERE id = ?')) {
      const tagId = Number(this.boundParams[0]);
      for (const [key, tags] of Object.entries(this.tagsByAccountId)) {
        this.tagsByAccountId[Number(key)] = tags.filter((item) => item.id !== tagId);
      }
      return { meta: { changes: 1, last_row_id: tagId } };
    }

    if (this.sql.startsWith('DELETE FROM account_tags WHERE account_id = ?')) {
      const accountId = Number(this.boundParams[0]);
      this.tagsByAccountId[accountId] = [];
      return { meta: { changes: 1, last_row_id: accountId } };
    }

    if (this.sql.startsWith('INSERT INTO mail_cache')) {
      const nextId = (this.mails.at(-1)?.id || 0) + 1;
      this.mails.push({
        id: nextId,
        account_id: Number(this.boundParams[0]),
        mailbox: this.boundParams[1] as MailCacheRow['mailbox'],
        mail_id: String(this.boundParams[2] || ''),
        sender: String(this.boundParams[3] || ''),
        sender_name: String(this.boundParams[4] || ''),
        subject: String(this.boundParams[5] || ''),
        text_content: String(this.boundParams[6] || ''),
        html_content: String(this.boundParams[7] || ''),
        mail_date: String(this.boundParams[8] || ''),
        is_read: 0,
        cached_at: '2026-04-10T00:00:00.000Z',
      });
      return { meta: { changes: 1, last_row_id: nextId } };
    }

    if (this.sql.startsWith('DELETE FROM mail_cache WHERE account_id = ? AND mailbox = ?')) {
      const accountId = Number(this.boundParams[0]);
      const mailbox = String(this.boundParams[1]);
      const before = this.mails.length;
      const next = this.mails.filter((item) => !(item.account_id === accountId && item.mailbox === mailbox));
      this.mails.splice(0, this.mails.length, ...next);
      return { meta: { changes: before - next.length, last_row_id: accountId } };
    }

    if (this.sql.startsWith('INSERT OR IGNORE INTO account_tags')) {
      const accountId = Number(this.boundParams[0]);
      const tagId = Number(this.boundParams[1]);
      const tag = Object.values(this.tagsByAccountId)
        .flat()
        .find((item) => item.id === tagId);

      if (!tag) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }

      if (!this.tagsByAccountId[accountId]) {
        this.tagsByAccountId[accountId] = [];
      }

      if (!this.tagsByAccountId[accountId].some((item) => item.id === tagId)) {
        this.tagsByAccountId[accountId].push(tag);
      }

      return { meta: { changes: 1, last_row_id: tagId } };
    }

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
            provider: 'custom',
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
            provider: 'custom',
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

test('cloudflare worker exposes auth check and login endpoints', async () => {
  const checkResponse = await worker.fetch(
    new Request('https://example.com/api/auth/check'),
    { DB: {}, ACCESS_PASSWORD: 'secret-pass' }
  ) as Response;

  const checkBody = await checkResponse.json() as { code: number; data: { required: boolean } };

  assert.equal(checkBody.code, 200);
  assert.equal(checkBody.data.required, true);

  const loginResponse = await worker.fetch(
    new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'secret-pass' }),
    }),
    { DB: {}, ACCESS_PASSWORD: 'secret-pass' }
  ) as Response;

  const loginBody = await loginResponse.json() as { code: number; data: { token: string; required: boolean } };

  assert.equal(loginBody.code, 200);
  assert.equal(loginBody.data.required, true);
  assert.equal(loginBody.data.token.length, 64);
});

test('cloudflare worker protects API routes when access password is enabled', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/api/tags'),
    {
      DB: new FakeD1Database([], {}),
      ACCESS_PASSWORD: 'secret-pass',
    }
  ) as Response;

  const body = await response.json() as { code: number; message: string };

  assert.equal(response.status, 401);
  assert.equal(body.code, 401);
  assert.equal(body.message, 'Unauthorized');
});

test('cloudflare worker serves tags and proxies after authorization', async () => {
  const loginResponse = await worker.fetch(
    new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'secret-pass' }),
    }),
    { DB: {}, ACCESS_PASSWORD: 'secret-pass' }
  ) as Response;
  const loginBody = await loginResponse.json() as { data: { token: string } };
  const authHeader = { Authorization: `Bearer ${loginBody.data.token}` };

  const db = new FakeD1Database(
    [],
    {
      1: [{ id: 10, name: 'VIP', color: '#ff0000', created_at: '2026-04-01T00:00:00.000Z' }],
      2: [{ id: 11, name: 'Ops', color: '#00ff00', created_at: '2026-04-02T00:00:00.000Z' }],
    },
    [
      {
        id: 1,
        name: 'proxy-1',
        provider: 'custom',
        type: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: '',
        password: '',
        is_default: 1,
        last_tested_at: null,
        last_test_ip: '1.1.1.1',
        status: 'active',
        created_at: '2026-04-01T00:00:00.000Z',
      },
    ]
  );

  const tagsResponse = await worker.fetch(
    new Request('https://example.com/api/tags', { headers: authHeader }),
    { DB: db, ACCESS_PASSWORD: 'secret-pass' }
  ) as Response;
  const proxiesResponse = await worker.fetch(
    new Request('https://example.com/api/proxies', { headers: authHeader }),
    { DB: db, ACCESS_PASSWORD: 'secret-pass' }
  ) as Response;

  const tagsBody = await tagsResponse.json() as { code: number; data: TagRow[] };
  const proxiesBody = await proxiesResponse.json() as { code: number; data: ProxyRow[] };

  assert.equal(tagsBody.code, 200);
  assert.deepEqual(tagsBody.data.map((tag) => tag.name), ['Ops', 'VIP']);
  assert.equal(proxiesBody.code, 200);
  assert.equal(proxiesBody.data[0].host, '127.0.0.1');
});

test('cloudflare worker returns unified 501 message for proxy mutations', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/api/proxies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'proxy-1',
        type: 'http',
        host: '127.0.0.1',
        port: 8080,
      }),
    }),
    { DB: new FakeD1Database([], {}) }
  ) as Response;

  const body = await response.json() as { code: number; message: string };

  assert.equal(response.status, 501);
  assert.equal(body.code, 501);
  assert.equal(
    body.message,
    'Cloudflare Workers does not support outbound proxy management. Creating, editing, deleting, testing, and setting default proxies are unavailable.'
  );
});

test('cloudflare worker reports backup endpoints as unsupported', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/api/backup/download'),
    { DB: {} }
  ) as Response;

  const body = await response.json() as { code: number; message: string };

  assert.equal(response.status, 501);
  assert.equal(body.code, 501);
  assert.equal(body.message, 'Backup is not supported on Cloudflare runtime.');
});

test('cloudflare worker supports account create update delete and tag assignment', async () => {
  const db = new FakeD1Database(
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
    ],
    {
      0: [
        { id: 10, name: 'VIP', color: '#ff0000', created_at: '2026-04-01T00:00:00.000Z' },
        { id: 11, name: 'Ops', color: '#00ff00', created_at: '2026-04-02T00:00:00.000Z' },
      ],
    }
  );

  const createResponse = await worker.fetch(
    new Request('https://example.com/api/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'new@outlook.com',
        password: 'secret',
        client_id: 'client-new',
        refresh_token: 'refresh-new',
        remark: 'seed',
      }),
    }),
    { DB: db }
  ) as Response;
  const createBody = await createResponse.json() as { code: number; data: AccountRow };
  assert.equal(createBody.code, 200);
  assert.equal(createBody.data.email, 'new@outlook.com');

  const updateResponse = await worker.fetch(
    new Request(`https://example.com/api/accounts/${createBody.data.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ remark: 'updated remark', status: 'inactive' }),
    }),
    { DB: db }
  ) as Response;
  const updateBody = await updateResponse.json() as { code: number; data: AccountRow };
  assert.equal(updateBody.code, 200);
  assert.equal(updateBody.data.remark, 'updated remark');
  assert.equal(updateBody.data.status, 'inactive');

  const tagsResponse = await worker.fetch(
    new Request(`https://example.com/api/accounts/${createBody.data.id}/tags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag_ids: [10, 11] }),
    }),
    { DB: db }
  ) as Response;
  const tagsBody = await tagsResponse.json() as { code: number; data: { account_id: number; tag_ids: number[] } };
  assert.equal(tagsBody.code, 200);
  assert.deepEqual(tagsBody.data.tag_ids, [10, 11]);

  const listResponse = await worker.fetch(
    new Request('https://example.com/api/accounts'),
    { DB: db }
  ) as Response;
  const listBody = await listResponse.json() as { code: number; data: { list: Array<{ id: number; tags: TagRow[] }> } };
  const created = listBody.data.list.find((item) => item.id === createBody.data.id);
  assert.deepEqual(created?.tags.map((tag) => tag.name), ['Ops', 'VIP']);

  const deleteResponse = await worker.fetch(
    new Request(`https://example.com/api/accounts/${createBody.data.id}`, {
      method: 'DELETE',
    }),
    { DB: db }
  ) as Response;
  const deleteBody = await deleteResponse.json() as { code: number; data: { deleted: boolean } };
  assert.equal(deleteBody.code, 200);
  assert.equal(deleteBody.data.deleted, true);
});

test('cloudflare worker supports tag create update delete', async () => {
  const db = new FakeD1Database([], {
    0: [{ id: 10, name: 'VIP', color: '#ff0000', created_at: '2026-04-01T00:00:00.000Z' }],
  });

  const createResponse = await worker.fetch(
    new Request('https://example.com/api/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ops', color: '#00ff00' }),
    }),
    { DB: db }
  ) as Response;
  const createBody = await createResponse.json() as { code: number; data: TagRow };
  assert.equal(createBody.code, 200);
  assert.equal(createBody.data.name, 'Ops');

  const updateResponse = await worker.fetch(
    new Request(`https://example.com/api/tags/${createBody.data.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ color: '#123456' }),
    }),
    { DB: db }
  ) as Response;
  const updateBody = await updateResponse.json() as { code: number; data: TagRow };
  assert.equal(updateBody.code, 200);
  assert.equal(updateBody.data.color, '#123456');

  const deleteResponse = await worker.fetch(
    new Request(`https://example.com/api/tags/${createBody.data.id}`, {
      method: 'DELETE',
    }),
    { DB: db }
  ) as Response;
  const deleteBody = await deleteResponse.json() as { code: number; data: { deleted: boolean } };
  assert.equal(deleteBody.code, 200);
  assert.equal(deleteBody.data.deleted, true);
});

test('cloudflare worker supports import preview confirm and export', async () => {
  const db = new FakeD1Database(
    [
      {
        id: 1,
        email: 'existing@outlook.com',
        password: '',
        client_id: 'client-existing',
        refresh_token: 'refresh-existing',
        remark: '',
        status: 'active',
        last_synced_at: null,
        token_refreshed_at: null,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    ],
    {}
  );

  const content = [
    'existing@outlook.com----pw0----client-existing-new----refresh-existing-new',
    'fresh@outlook.com----pw1----client-fresh----refresh-fresh',
  ].join('\n');

  const previewResponse = await worker.fetch(
    new Request('https://example.com/api/accounts/import-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        separator: '----',
        format: ['email', 'password', 'client_id', 'refresh_token'],
      }),
    }),
    { DB: db }
  ) as Response;
  const previewBody = await previewResponse.json() as {
    code: number;
    data: { newItems: Array<{ email: string }>; duplicates: Array<{ email: string }>; errors: string[] };
  };
  assert.equal(previewBody.code, 200);
  assert.deepEqual(previewBody.data.newItems.map((item) => item.email), ['fresh@outlook.com']);
  assert.deepEqual(previewBody.data.duplicates.map((item) => item.email), ['existing@outlook.com']);

  const confirmResponse = await worker.fetch(
    new Request('https://example.com/api/accounts/import-confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        separator: '----',
        format: ['email', 'password', 'client_id', 'refresh_token'],
        mode: 'overwrite',
      }),
    }),
    { DB: db }
  ) as Response;
  const confirmBody = await confirmResponse.json() as {
    code: number;
    data: { imported: number; skipped: number; errors: string[] };
  };
  assert.equal(confirmBody.code, 200);
  assert.equal(confirmBody.data.imported, 2);
  assert.equal(confirmBody.data.skipped, 0);

  const exportResponse = await worker.fetch(
    new Request('https://example.com/api/accounts/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        separator: '|',
        format: ['email', 'client_id', 'refresh_token'],
      }),
    }),
    { DB: db }
  ) as Response;
  const exportBody = await exportResponse.json() as {
    code: number;
    data: { content: string; count: number };
  };
  assert.equal(exportBody.code, 200);
  assert.equal(exportBody.data.count, 2);
  assert.match(exportBody.data.content, /existing@outlook\.com\|client-existing-new\|refresh-existing-new/);
  assert.match(exportBody.data.content, /fresh@outlook\.com\|client-fresh\|refresh-fresh/);
});

test('cloudflare worker supports cached mails, graph fetch, fetch-new and clear', async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1Database(
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
    ],
    {},
    [],
    [
      {
        id: 1,
        account_id: 1,
        mailbox: 'INBOX',
        mail_id: 'cached-1',
        sender: 'cached@test.com',
        sender_name: 'Cached',
        subject: 'Cached mail',
        text_content: 'cached body',
        html_content: '',
        mail_date: '2026-04-01T00:00:00.000Z',
        is_read: 0,
        cached_at: '2026-04-01T00:00:00.000Z',
      },
    ]
  );

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        access_token: 'graph-access-token',
        refresh_token: 'refresh-rotated',
        scope: 'Mail.Read offline_access',
        expires_in: 3600,
      });
    }

    if (url.includes('/messages?$top=1')) {
      return createJsonResponse({
        value: [
          {
            id: 'graph-2',
            from: { emailAddress: { address: 'new@test.com', name: 'New' } },
            subject: 'Newest mail',
            bodyPreview: 'preview 2',
            body: { content: '<p>Newest</p>' },
            createdDateTime: '2026-04-11T00:00:00.000Z',
          },
        ],
      });
    }

    if (url.includes('/messages?$top=50')) {
      return createJsonResponse({
        value: [
          {
            id: 'graph-1',
            from: { emailAddress: { address: 'graph@test.com', name: 'Graph' } },
            subject: 'Graph mail',
            bodyPreview: 'preview 1',
            body: { content: '<p>Graph</p>' },
            createdDateTime: '2026-04-10T00:00:00.000Z',
          },
          {
            id: 'graph-2',
            from: { emailAddress: { address: 'new@test.com', name: 'New' } },
            subject: 'Newest mail',
            bodyPreview: 'preview 2',
            body: { content: '<p>Newest</p>' },
            createdDateTime: '2026-04-11T00:00:00.000Z',
          },
        ],
      });
    }

    if (url.includes('/messages/') && init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    return createJsonResponse({}, 404);
  }) as typeof globalThis.fetch;

  try {
    const cachedResponse = await worker.fetch(
      new Request('https://example.com/api/mails/cached?account_id=1&mailbox=INBOX&page=1&pageSize=50'),
      { DB: db }
    ) as Response;
    const cachedBody = await cachedResponse.json() as { code: number; data: { list: MailCacheRow[]; total: number } };
    assert.equal(cachedBody.code, 200);
    assert.equal(cachedBody.data.total, 1);
    assert.equal(cachedBody.data.list[0].subject, 'Cached mail');

    const fetchResponse = await worker.fetch(
      new Request('https://example.com/api/mails/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: 1, mailbox: 'INBOX' }),
      }),
      { DB: db }
    ) as Response;
    const fetchBody = await fetchResponse.json() as { code: number; data: { total: number; protocol: string; mails: MailCacheRow[] } };
    assert.equal(fetchBody.code, 200);
    assert.equal(fetchBody.data.protocol, 'graph');
    assert.equal(fetchBody.data.total, 2);

    const fetchNewResponse = await worker.fetch(
      new Request('https://example.com/api/mails/fetch-new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: 1, mailbox: 'INBOX' }),
      }),
      { DB: db }
    ) as Response;
    const fetchNewBody = await fetchNewResponse.json() as { code: number; data: MailCacheRow | null };
    assert.equal(fetchNewBody.code, 200);
    assert.equal(fetchNewBody.data?.subject, 'Newest mail');

    const clearResponse = await worker.fetch(
      new Request('https://example.com/api/mails/clear', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: 1, mailbox: 'INBOX' }),
      }),
      { DB: db }
    ) as Response;
    const clearBody = await clearResponse.json() as { code: number; data: { message: string } };
    assert.equal(clearBody.code, 200);
    assert.equal(clearBody.data.message, '邮件正在清空中...');

    const afterClearResponse = await worker.fetch(
      new Request('https://example.com/api/mails/cached?account_id=1&mailbox=INBOX&page=1&pageSize=50'),
      { DB: db }
    ) as Response;
    const afterClearBody = await afterClearResponse.json() as { code: number; data: { total: number } };
    assert.equal(afterClearBody.data.total, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
