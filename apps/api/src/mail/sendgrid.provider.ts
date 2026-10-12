import { Logger } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import type { MailProvider, MailTemplateKey, SendEmailInput } from './mail-provider';

/** env var holding each designed template's id. */
const TEMPLATE_ENV: Record<MailTemplateKey, keyof ServerEnv> = {
  welcome: 'SENDGRID_TEMPLATE_WELCOME',
  verify_email: 'SENDGRID_TEMPLATE_VERIFY_EMAIL',
  booking_received: 'SENDGRID_TEMPLATE_BOOKING_RECEIVED',
  booking_confirmed: 'SENDGRID_TEMPLATE_BOOKING_CONFIRMED',
  booking_cancelled: 'SENDGRID_TEMPLATE_BOOKING_CANCELLED',
  notice: 'SENDGRID_TEMPLATE_NOTICE',
};

/**
 * SendGrid adapter (spec §19): POSTs to the v3 Mail Send API. Shares the
 * MAIL_FROM address with the Resend adapter. SendGrid returns 202 on success;
 * any non-2xx is surfaced as `email_send_failed:<status>`.
 *
 * When the email names a designed template and that template's id is in env,
 * it goes out as a dynamic template (subject and copy come from
 * `dynamic_template_data`). Otherwise the inline HTML is sent, so a missing id
 * degrades to a plainer email instead of no email.
 */
export class SendGridMailProvider implements MailProvider {
  readonly name = 'sendgrid';
  private readonly logger = new Logger('Mail');

  constructor(private readonly env: ServerEnv) {}

  async send(input: SendEmailInput): Promise<void> {
    const templateId = input.template
      ? (this.env[TEMPLATE_ENV[input.template.key]] as string | undefined)
      : undefined;

    const body = templateId
      ? {
          from: parseFrom(this.env.MAIL_FROM),
          template_id: templateId,
          personalizations: [
            {
              to: [{ email: input.to }],
              // `subject` travels inside the data: the template's subject line
              // is "{{subject}}", so one template serves every locale.
              dynamic_template_data: { subject: input.subject, ...input.template!.data },
            },
          ],
        }
      : {
          from: parseFrom(this.env.MAIL_FROM),
          personalizations: [{ to: [{ email: input.to }] }],
          subject: input.subject,
          // SendGrid requires content entries in increasing MIME precedence:
          // plain text before HTML.
          content: [
            ...(input.text ? [{ type: 'text/plain', value: input.text }] : []),
            { type: 'text/html', value: input.html },
          ],
        };

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.SENDGRID_API_KEY!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
