import { Proxy, ProxyProvider } from '../types';

export const CLOUDFLARE_WARP_DEFAULTS = {
  name: 'Cloudflare WARP',
  host: '127.0.0.1',
  port: 40000,
  type: 'socks5' as const,
};

type ProxyTestKind = 'ip-json' | 'cloudflare-trace';

export function normalizeProxyDraft(data: Partial<Proxy>): Partial<Proxy> {
  const provider: ProxyProvider = data.provider === 'cloudflare-warp' ? 'cloudflare-warp' : 'custom';
  const normalizedPort = Number(data.port);
  const normalized: Partial<Proxy> = {
    ...data,
    provider,
    type: data.type === 'http' ? 'http' : 'socks5',
    name: (data.name || '').trim(),
    host: (data.host || '').trim(),
    port: normalizedPort,
    username: (data.username || '').trim(),
    password: data.password || '',
    is_default: Boolean(data.is_default),
  };

  if (provider === 'cloudflare-warp') {
    normalized.name = normalized.name || CLOUDFLARE_WARP_DEFAULTS.name;
    normalized.host = normalized.host || CLOUDFLARE_WARP_DEFAULTS.host;
    if (!Number.isInteger(normalizedPort) || normalizedPort <= 0) {
      normalized.port = CLOUDFLARE_WARP_DEFAULTS.port;
    }
  }

  return normalized;
}

export function validateProxyDraft(data: Partial<Proxy>): string | null {
  if (data.provider !== 'custom' && data.provider !== 'cloudflare-warp') {
    return 'provider is invalid';
  }

  if (data.type !== 'socks5' && data.type !== 'http') {
    return 'type is invalid';
  }

  if (!data.host) {
    return 'host is required';
  }

  const port = data.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return 'port must be a valid TCP port';
  }

  return null;
}

export function getProxyTestTarget(proxy: Pick<Proxy, 'provider'>): { url: string; kind: ProxyTestKind } {
  if (proxy.provider === 'cloudflare-warp') {
    return {
      url: 'https://www.cloudflare.com/cdn-cgi/trace',
      kind: 'cloudflare-trace',
    };
  }

  return {
    url: 'https://httpbin.org/ip',
    kind: 'ip-json',
  };
}

export function parseCloudflareTrace(text: string): { ip: string; colo: string; warpEnabled: boolean } {
  const values = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split('=');
      if (key) {
        acc[key] = rest.join('=');
      }
      return acc;
    }, {});

  const warpValue = (values.warp || '').toLowerCase();

  return {
    ip: values.ip || '',
    colo: values.colo || '',
    warpEnabled: Boolean(warpValue) && warpValue !== 'off',
  };
}
