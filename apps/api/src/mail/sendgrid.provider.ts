import { Logger } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import type { MailProvider, SendEmailInput } from './mail-provider';

/**
 * SendGrid adapter (spec §19): POSTs to the v3 Mail Send API. Shares the
 * MAIL_FROM address with the Resend adapter. SendGrid returns 202 on success;
 * any non-2xx is surfaced as `email_send_failed:<status>`.
 */
export class SendGridMailProvider implements MailProvider {
  readonly name = 'sendgrid';
  private readonly logger = new Logger('Mail');

  constructor(private readonly env: ServerEnv) {}

  async send(input: SendEmailInput): Promise<void> {
    const content: { type: string; value: string }[] = [];
    // SendGrid requires content entries in increasing MIME precedence: plain
    // text before HTML.
    if (input.text) content.push({ type: 'text/plain', value: input.text });
    content.push({ type: 'text/html', value: input.html });

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.SENDGRID_API_KEY!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: parseFrom(this.env.MAIL_FROM),
        subject: input.subject,
        content,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`SendGrid failed (${res.status}): ${body}`);
      throw new Error(`email_send_failed:${res.status}`);
    }
  }
}

/**
 * SendGrid wants `from` as `{ email, name }`, whereas MAIL_FROM is a single
 * RFC 5322 string ("Name <addr>" or a bare address). Split it so both forms work.
 */
function parseFrom(from: string): { email: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = (match[1] ?? '').trim();
    const email = (match[2] ?? '').trim();
    return name ? { email, name } : { email };
  }
  return { email: from.trim() };
}
