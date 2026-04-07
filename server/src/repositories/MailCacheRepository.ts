import type { MailMessage } from '../types';
import type { DatabaseAdapter } from '../database/types';

export class MailCacheRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  async getRecent(limit = 5): Promise<MailMessage[]> {
    return this.db.all<MailMessage>(
      'SELECT mc.*, a.email as account_email FROM mail_cache mc JOIN accounts a ON mc.account_id = a.id ORDER BY mc.mail_date DESC LIMIT ?',
      [limit]
    );
  }

  async countByAccount(accountId: number, mailbox: string): Promise<number> {
    const row = await this.db.first<{ c: number }>(
      'SELECT COUNT(*) as c FROM mail_cache WHERE account_id = ? AND mailbox = ?',
      [accountId, mailbox]
    );

    return row?.c ?? 0;
  }

  async countAll(mailbox: string): Promise<number> {
    const row = await this.db.first<{ c: number }>(
      'SELECT COUNT(*) as c FROM mail_cache WHERE mailbox = ?',
      [mailbox]
    );

    return row?.c ?? 0;
  }
}
