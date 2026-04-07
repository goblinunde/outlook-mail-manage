import type { AppRuntime } from '../config/runtime';

export interface RuntimeCapabilities {
  runtime: AppRuntime;
  features: {
    proxyAgents: boolean;
    imap: boolean;
    fileBackup: boolean;
    d1: boolean;
    sqlite: boolean;
  };
}

export function getRuntimeCapabilities(runtime: AppRuntime): RuntimeCapabilities {
  if (runtime === 'cloudflare') {
    return {
      runtime,
      features: {
        proxyAgents: false,
        imap: false,
        fileBackup: false,
        d1: true,
        sqlite: false,
      },
    };
  }

  return {
    runtime,
    features: {
      proxyAgents: true,
      imap: true,
      fileBackup: true,
      d1: false,
      sqlite: true,
    },
  };
}
