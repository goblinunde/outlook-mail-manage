import test from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeCapabilities } from '../capabilities';

test('getRuntimeCapabilities enables node-only features on node runtime', () => {
  const capabilities = getRuntimeCapabilities('node');

  assert.equal(capabilities.runtime, 'node');
  assert.equal(capabilities.features.proxyAgents, true);
  assert.equal(capabilities.features.imap, true);
  assert.equal(capabilities.features.fileBackup, true);
  assert.equal(capabilities.features.d1, false);
  assert.equal(capabilities.features.sqlite, true);
});

test('getRuntimeCapabilities disables node-only features on cloudflare runtime', () => {
  const capabilities = getRuntimeCapabilities('cloudflare');

  assert.equal(capabilities.runtime, 'cloudflare');
  assert.equal(capabilities.features.proxyAgents, false);
  assert.equal(capabilities.features.imap, false);
  assert.equal(capabilities.features.fileBackup, false);
  assert.equal(capabilities.features.d1, true);
  assert.equal(capabilities.features.sqlite, false);
});
