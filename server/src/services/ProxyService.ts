import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyAgent } from 'undici';
import { Proxy, ProxyTestResult } from '../types';
import { ProxyModel } from '../models/Proxy';
import { getProxyTestTarget, parseCloudflareTrace } from './proxySupport';
import logger from '../utils/logger';

const proxyModel = new ProxyModel();

export class ProxyService {
  createSocksAgent(proxy: Proxy): SocksProxyAgent {
    let url = `socks5://`;
    if (proxy.username && proxy.password) {
      url += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
    }
    url += `${proxy.host}:${proxy.port}`;
    return new SocksProxyAgent(url);
  }

  createHttpDispatcher(proxy: Proxy): ProxyAgent {
    let url = `http://`;
    if (proxy.username && proxy.password) {
      url += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
    }
    url += `${proxy.host}:${proxy.port}`;
    return new ProxyAgent(url);
  }

  getAgent(proxyId?: number): { agent?: SocksProxyAgent; dispatcher?: ProxyAgent; type?: string } {
    let proxy: Proxy | undefined;
    if (proxyId) {
      proxy = proxyModel.getById(proxyId);
    } else {
      proxy = proxyModel.getDefault();
    }
    if (!proxy) return {};

    if (proxy.type === 'socks5') {
      return { agent: this.createSocksAgent(proxy), type: 'socks5' };
    } else {
      return { dispatcher: this.createHttpDispatcher(proxy), type: 'http' };
    }
  }

  async testProxy(proxy: Proxy): Promise<ProxyTestResult> {
    const start = Date.now();
    try {
      const target = getProxyTestTarget(proxy);
      let response: Response;
      if (proxy.type === 'socks5') {
        const agent = this.createSocksAgent(proxy);
        const nodefetch = require('node-fetch');
        response = await nodefetch(target.url, { agent, timeout: 15000 });
      } else {
        const dispatcher = this.createHttpDispatcher(proxy);
        const { fetch: undiciFetch } = require('undici');
        response = await undiciFetch(target.url, { dispatcher });
      }

      if (!(response as any).ok) {
        throw new Error(`Proxy test responded with ${(response as any).status}`);
      }

      const latency = Date.now() - start;

      if (target.kind === 'cloudflare-trace') {
        const trace = parseCloudflareTrace(await (response as any).text());
        logger.info(
          `Proxy test success: ${proxy.host}:${proxy.port} -> ${trace.ip || 'unknown'} (${latency}ms, warp=${trace.warpEnabled ? 'on' : 'off'})`
        );
        return {
          ip: trace.ip,
          latency,
          provider: proxy.provider,
          endpoint: target.url,
          status: trace.ip ? 'active' : 'failed',
          warpEnabled: trace.warpEnabled,
          colo: trace.colo,
        };
      }

      const data = await (response as any).json();
      logger.info(`Proxy test success: ${proxy.host}:${proxy.port} -> ${data.origin} (${latency}ms)`);
      return {
        ip: data.origin,
        latency,
        provider: proxy.provider,
        endpoint: target.url,
        status: 'active',
      };
    } catch (err: any) {
      logger.error(`Proxy test failed: ${proxy.host}:${proxy.port} - ${err.message}`);
      return {
        ip: '',
        latency: Date.now() - start,
        provider: proxy.provider,
        endpoint: getProxyTestTarget(proxy).url,
        status: 'failed',
      };
    }
  }
}
