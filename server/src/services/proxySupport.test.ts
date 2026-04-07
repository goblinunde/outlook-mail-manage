import test from 'node:test';
import assert from 'node:assert/strict';
import { getProxyTestTarget, normalizeProxyDraft, parseCloudflareTrace } from './proxySupport';

test('normalizeProxyDraft applies Cloudflare WARP defaults', () => {
  const normalized = normalizeProxyDraft({
    provider: 'cloudflare-warp',
    name: '',
    host: '',
    port: 0,
  });

  assert.equal(normalized.provider, 'cloudflare-warp');
  assert.equal(normalized.name, 'Cloudflare WARP');
  assert.equal(normalized.type, 'socks5');
  assert.equal(normalized.host, '127.0.0.1');
  assert.equal(normalized.port, 40000);
});

test('parseCloudflareTrace extracts IP, colo and warp status', () => {
  const parsed = parseCloudflareTrace('ip=198.51.100.8\nwarp=on\ncolo=SJC\n');

  assert.equal(parsed.ip, '198.51.100.8');
  assert.equal(parsed.colo, 'SJC');
  assert.equal(parsed.warpEnabled, true);
});

test('getProxyTestTarget uses Cloudflare trace for WARP providers', () => {
  const target = getProxyTestTarget({
    provider: 'cloudflare-warp',
  });

  assert.equal(target.kind, 'cloudflare-trace');
  assert.equal(target.url, 'https://www.cloudflare.com/cdn-cgi/trace');
});

test('getProxyTestTarget keeps generic IP check for custom proxies', () => {
  const target = getProxyTestTarget({
    provider: 'custom',
  });

  assert.equal(target.kind, 'ip-json');
  assert.equal(target.url, 'https://httpbin.org/ip');
});
