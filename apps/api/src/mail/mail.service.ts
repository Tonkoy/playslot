import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { SERVER_ENV } from '../config/app-config.module';
import { type ApiLocale, DEFAULT_LOCALE } from '../common/i18n';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Transactional email (spec §19). Uses Resend's REST API when RESEND_API_KEY is
 * set; otherwise logs to the console so local dev works without a provider.
 * All jobs must be idempotent at the caller; this method just sends.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(@Inject(SERVER_ENV) private readonly env: ServerEnv) {}

  async send(input: SendEmailInput): Promise<void> {
    const apiKey = this.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.log(
        `[dev-mail] To: ${input.to} | Subject: ${input.subject}\n${input.text ?? input.html}`,
      );
      return;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PlaySlot <no-reply@playslot.app>',
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

  // ── templated helpers (localized; bg default) ──

  async sendVerification(to: string, link: string, locale: ApiLocale = DEFAULT_LOCALE): Promise<void> {
    const copy =
      locale === 'en'
        ? {
            subject: 'Confirm your PlaySlot email',
            body: `Welcome to PlaySlot! Confirm your email to start booking:`,
            cta: 'Confirm email',
          }
        : {
            subject: 'Потвърдете имейла си в PlaySlot',
            body: `Добре дошли в PlaySlot! Потвърдете имейла си, за да започнете да резервирате:`,
            cta: 'Потвърди имейла',
          };
    await this.send({
      to,
      subject: copy.subject,
      text: `${copy.body}\n${link}`,
      html: emailShell(`<p>${copy.body}</p>${button(link, copy.cta)}<p>${link}</p>`),
    });
  }

  async sendConfirmation(
    to: string,
    info: { clubName: string; when: string; priceCents: number; currency: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const price = `${(info.priceCents / 100).toFixed(2)} ${info.currency}`;
    const copy =
      locale === 'en'
        ? {
            subject: `Booking confirmed — ${info.clubName}`,
            body: `Your booking at ${info.clubName} on ${info.when} is confirmed. Total: ${price}.`,
          }
        : {
            subject: `Потвърдена резервация — ${info.clubName}`,
            body: `Резервацията ви в ${info.clubName} на ${info.when} е потвърдена. Общо: ${price}.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  async sendCancellation(
    to: string,
    info: { clubName: string; when: string; refundCents: number; currency: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const refund = `${(info.refundCents / 100).toFixed(2)} ${info.currency}`;
    const copy =
      locale === 'en'
        ? {
            subject: `Booking cancelled — ${info.clubName}`,
            body: `Your booking at ${info.clubName} on ${info.when} was cancelled.${info.refundCents > 0 ? ` Refund: ${refund}.` : ''}`,
          }
        : {
            subject: `Отменена резервация — ${info.clubName}`,
            body: `Резервацията ви в ${info.clubName} на ${info.when} беше отменена.${info.refundCents > 0 ? ` Възстановена сума: ${refund}.` : ''}`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  async sendPasswordReset(
    to: string,
    link: string,
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const copy =
      locale === 'en'
        ? {
            subject: 'Reset your PlaySlot password',
            body: 'We received a request to reset your password. This link is valid for 1 hour:',
            cta: 'Reset password',
          }
        : {
            subject: 'Смяна на паролата в PlaySlot',
            body: 'Получихме заявка за смяна на паролата. Връзката е валидна 1 час:',
            cta: 'Смени паролата',
          };
    await this.send({
      to,
      subject: copy.subject,
      text: `${copy.body}\n${link}`,
      html: emailShell(`<p>${copy.body}</p>${button(link, copy.cta)}<p>${link}</p>`),
    });
  }
}

function button(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;background:#14181b;color:#c7f000;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:700">${label}</a></p>`;
}

function emailShell(inner: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#14181b"><h2>PlaySlot</h2>${inner}</div>`;
}
