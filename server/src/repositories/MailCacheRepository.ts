import type { MailMessage, PaginatedResponse } from '../types';
import type { DatabaseAdapter } from '../database/types';

export class MailCacheRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  async getByAccount(accountId: number, mailbox: string, page = 1, pageSize = 50): Promise<PaginatedResponse<MailMessage>> {
    const offset = (page - 1) * pageSize;
    const totalRow = await this.db.first<{ c: number }>(
      'SELECT COUNT(*) as c FROM mail_cache WHERE account_id = ? AND mailbox = ?',
      [accountId, mailbox]
    );
    const list = await this.db.all<MailMessage>(
      'SELECT * FROM mail_cache WHERE account_id = ? AND mailbox = ? ORDER BY mail_date DESC LIMIT ? OFFSET ?',
      [accountId, mailbox, pageSize, offset]
    );

    return {
      list,
      total: totalRow?.c ?? 0,
      page,
      pageSize,
    };
  }

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

  async upsert(accountId: number, mailbox: string, mails: Partial<MailMessage>[]): Promise<void> {
    await this.clearByAccount(accountId, mailbox);

    for (const mail of mails) {
      await this.db.run(`
        INSERT INTO mail_cache (
          account_id, mailbox, mail_id, sender, sender_name, subject, text_content, html_content, mail_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        accountId,
        mailbox,
        mail.mail_id || '',
        mail.sender || '',
        mail.sender_name || '',
        mail.subject || '',
        mail.text_content || '',
        mail.html_content || '',
        mail.mail_date || null,
      ]);
    }
  }

  async clearByAccount(accountId: number, mailbox: string): Promise<void> {
    await this.db.run(
      'DELETE FROM mail_cache WHERE account_id = ? AND mailbox = ?',
      [accountId, mailbox]
    );
  }
}
