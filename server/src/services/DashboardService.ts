import type { AccountWithTags, DashboardStats, MailMessage, Proxy } from '../types';

interface AccountReader {
  getAll(): Promise<AccountWithTags[]>;
}

interface CacheReader {
  getRecent(limit: number): Promise<MailMessage[]>;
  countByAccount(accountId: number, mailbox: string): Promise<number>;
  countAll(mailbox: string): Promise<number>;
}

interface ProxyReader {
  list(): Promise<Proxy[]>;
}

interface DashboardServiceDependencies {
  accountReader: AccountReader;
  cacheReader: CacheReader;
  proxyReader: ProxyReader;
}

export class DashboardService {
  constructor(private readonly dependencies: DashboardServiceDependencies) {}

  async getStats(): Promise<DashboardStats> {
    const accounts = await this.dependencies.accountReader.getAll();
    const [proxies, recentMails, totalInboxMails, totalJunkMails, accountStats] = await Promise.all([
      this.dependencies.proxyReader.list(),
      this.dependencies.cacheReader.getRecent(5),
      this.dependencies.cacheReader.countAll('INBOX'),
      this.dependencies.cacheReader.countAll('Junk'),
      Promise.all(accounts.map(async (acc) => ({
        account_id: acc.id,
        email: acc.email,
        inbox_count: await this.dependencies.cacheReader.countByAccount(acc.id, 'INBOX'),
        junk_count: await this.dependencies.cacheReader.countByAccount(acc.id, 'Junk'),
      }))),
    ]);

    const now = Date.now();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

    return {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.status === 'active').length,
      totalInboxMails,
      totalJunkMails,
      totalProxies: proxies.length,
      activeProxies: proxies.filter(p => p.status === 'active').length,
      recentMails,
      accountStats,
      expiringTokens: accounts.filter(a => {
        if (!a.token_refreshed_at) return false;
        return (now - new Date(a.token_refreshed_at).getTime()) > sixtyDaysMs;
      }).length,
      errorAccounts: accounts.filter(a => a.status === 'error').length,
      unusedAccounts: accounts.filter(a => !a.token_refreshed_at).length,
    };
  }
}
