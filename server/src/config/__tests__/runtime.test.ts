import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeConfig } from '../runtime';

test('resolveRuntimeConfig uses sqlite defaults for node runtime', () => {
  const config = resolveRuntimeConfig({
    runtime: 'node',
    env: {},
  });

  assert.equal(config.runtime, 'node');
  assert.equal(config.logLevel, 'info');
  assert.equal(config.accessPassword, '');
  assert.equal(config.db.provider, 'sqlite');
  assert.equal(config.db.path, './data/outlook.db');
  assert.equal(config.db.binding, 'DB');
});

test('resolveRuntimeConfig uses d1 defaults for cloudflare runtime', () => {
  const config = resolveRuntimeConfig({
    runtime: 'cloudflare',
    env: {},
  });

  assert.equal(config.runtime, 'cloudflare');
  assert.equal(config.logLevel, 'info');
  assert.equal(config.accessPassword, '');
  assert.equal(config.db.provider, 'd1');
  assert.equal(config.db.binding, 'DB');
  assert.equal(config.db.path, './data/outlook.db');
});
