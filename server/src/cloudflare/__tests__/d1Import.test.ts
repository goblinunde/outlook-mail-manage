import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1ImportChunks, renderD1ImportStatements } from '../d1Import';

test('renderD1ImportStatements emits delete statements before inserts', () => {
  const statements = renderD1ImportStatements({
    accounts: [{ id: 1, email: 'alpha@outlook.com', password: '', client_id: 'cid', refresh_token: 'rt', remark: '', status: 'active', last_synced_at: null, token_refreshed_at: null, created_at: '2026-04-01', updated_at: '2026-04-01' }],
    proxies: [{ id: 1, name: 'Cloudflare WARP', provider: 'cloudflare-warp', type: 'socks5', host: '127.0.0.1', port: 40000, username: '', password: '', is_default: 1, last_tested_at: null, last_test_ip: '', status: 'active', created_at: '2026-04-01' }],
    tags: [{ id: 1, name: 'VIP', color: '#ff6600', created_at: '2026-04-01' }],
    account_tags: [{ account_id: 1, tag_id: 1 }],
    mail_cache: [],
  });

  assert.deepEqual(statements.slice(0, 5), [
    'DELETE FROM account_tags;',
    'DELETE FROM mail_cache;',
    'DELETE FROM proxies;',
    'DELETE FROM tags;',
    'DELETE FROM accounts;',
  ]);
  assert.equal(statements[5].startsWith('INSERT INTO accounts'), true);
});

test('renderD1ImportStatements escapes strings and preserves nulls', () => {
  const statements = renderD1ImportStatements({
    accounts: [{ id: 1, email: "o'hara@outlook.com", password: '', client_id: 'cid', refresh_token: 'rt', remark: "team's mailbox", status: 'active', last_synced_at: null, token_refreshed_at: null, created_at: '2026-04-01', updated_at: '2026-04-01' }],
    proxies: [],
    tags: [],
    account_tags: [],
    mail_cache: [],
  });

  const insert = statements.find((statement) => statement.startsWith('INSERT INTO accounts'));
  assert.equal(insert?.includes("'o''hara@outlook.com'"), true);
  assert.equal(insert?.includes("'team''s mailbox'"), true);
  assert.equal(insert?.includes('NULL'), true);
});

test('createD1ImportChunks wraps statements into executable SQL chunks', () => {
  const chunks = createD1ImportChunks({
    accounts: [{ id: 1, email: 'alpha@outlook.com', password: '', client_id: 'cid', refresh_token: 'rt', remark: '', status: 'active', last_synced_at: null, token_refreshed_at: null, created_at: '2026-04-01', updated_at: '2026-04-01' }],
    proxies: [],
    tags: [],
    account_tags: [],
    mail_cache: [],
  }, 2);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks[0].startsWith('PRAGMA defer_foreign_keys = true;'), true);
  assert.equal(chunks[0].includes('BEGIN TRANSACTION;'), true);
  assert.equal(chunks[0].includes('COMMIT;'), true);
});
