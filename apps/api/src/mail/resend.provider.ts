import { Logger } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import type { MailProvider, SendEmailInput } from './mail-provider';

/**
 * Resend adapter (spec §19): POSTs to the Resend REST API. The from-address is
 * driven by MAIL_FROM so it stays in sync with the SendGrid adapter.
 */
export class ResendMailProvider implements MailProvider {
  readonly name = 'resend';
  private readonly logger = new Logger('Mail');

  constructor(private readonly env: ServerEnv) {}

  async send(input: SendEmailInput): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.RESEND_API_KEY!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.env.MAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Resend failed (${res.status}): ${body}`);
      throw new Error(`email_send_failed:${res.status}`);
    }
  }
}
