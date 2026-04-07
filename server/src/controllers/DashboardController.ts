import { Context } from 'koa';
import { nodeDatabaseAdapter } from '../database';
import { AccountRepository } from '../repositories/AccountRepository';
import { MailCacheRepository } from '../repositories/MailCacheRepository';
import { ProxyRepository } from '../repositories/ProxyRepository';
import { DashboardService } from '../services/DashboardService';
import { success } from '../utils/response';

const dashboardService = new DashboardService({
  accountReader: new AccountRepository(nodeDatabaseAdapter),
  cacheReader: new MailCacheRepository(nodeDatabaseAdapter),
  proxyReader: new ProxyRepository(nodeDatabaseAdapter),
});

export class DashboardController {
  async stats(ctx: Context) {
    const data = await dashboardService.getStats();
    success(ctx, data);
  }
}
