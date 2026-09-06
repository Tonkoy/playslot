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

  /** Welcome email, sent once the user confirms their email (spec §19). */
  async sendWelcome(to: string, name: string, locale: ApiLocale = DEFAULT_LOCALE): Promise<void> {
    const first = name.trim().split(/\s+/)[0] || name;
    const copy =
      locale === 'en'
        ? {
            subject: 'Welcome to PlaySlot 🎾',
            greeting: `Hi ${first},`,
            body: 'Your email is confirmed — your account is ready. Find a club or a coach and book your first slot.',
            cta: 'Browse clubs',
          }
        : {
            subject: 'Добре дошли в PlaySlot 🎾',
            greeting: `Здравей, ${first},`,
            body: 'Имейлът ви е потвърден — акаунтът ви е готов. Открийте клуб или треньор и направете първата си резервация.',
            cta: 'Разгледай клубовете',
          };
    await this.send({
      to,
      subject: copy.subject,
      text: `${copy.greeting}\n${copy.body}\n${this.webLink(locale, 'clubs')}`,
      html: emailShell(
        `<p>${copy.greeting}</p><p>${copy.body}</p>${button(this.webLink(locale, 'clubs'), copy.cta)}`,
      ),
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

  /** Notify club admins/staff that a booking landed on their calendar (spec §19). */
  async sendStaffBookingNotice(
    to: string,
    info: {
      clubName: string;
      when: string;
      customerName: string;
      what: string;
      priceCents: number;
      currency: string;
    },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const price = `${(info.priceCents / 100).toFixed(2)} ${info.currency}`;
    const copy =
      locale === 'en'
        ? {
            subject: `New booking — ${info.clubName}`,
            body: `${info.customerName} booked ${info.what} on ${info.when}. Total: ${price}.`,
          }
        : {
            subject: `Нова резервация — ${info.clubName}`,
            body: `${info.customerName} резервира ${info.what} на ${info.when}. Общо: ${price}.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /** Notify the selected coach of a new lesson booking (spec §19). */
  async sendCoachBookingNotice(
    to: string,
    info: { clubName: string; when: string; customerName: string; serviceName?: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const service = info.serviceName ? ` (${info.serviceName})` : '';
    const copy =
      locale === 'en'
        ? {
            subject: `New lesson booked — ${info.when}`,
            body: `${info.customerName} booked a lesson${service} with you at ${info.clubName} on ${info.when}.`,
          }
        : {
            subject: `Нов урок — ${info.when}`,
            body: `${info.customerName} резервира урок${service} при вас в ${info.clubName} на ${info.when}.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /**
   * Daily digest of a coach's lessons for the day (spec §19). `lessons` is
   * already ordered by start time and localized to the club timezone.
   */
  async sendCoachDailySchedule(
    to: string,
    info: {
      coachName: string;
      date: string;
      lessons: { time: string; clubName: string; customerName: string; serviceName?: string }[];
    },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const first = info.coachName.trim().split(/\s+/)[0] || info.coachName;
    const n = info.lessons.length;
    const copy =
      locale === 'en'
        ? {
            subject: `Your lessons today (${info.date}) — ${n}`,
            greeting: `Good morning, ${first}!`,
            intro:
              n === 1
                ? 'You have 1 lesson scheduled today:'
                : `You have ${n} lessons scheduled today:`,
          }
        : {
            subject: `Уроците ви днес (${info.date}) — ${n}`,
            greeting: `Добро утро, ${first}!`,
            intro: n === 1 ? 'Днес имате 1 насрочен урок:' : `Днес имате ${n} насрочени урока:`,
          };
    const line = (l: (typeof info.lessons)[number]) =>
      `${l.time} — ${l.customerName}${l.serviceName ? ` (${l.serviceName})` : ''} @ ${l.clubName}`;
    const textLines = info.lessons.map(line).join('\n');
    const htmlLines = info.lessons.map((l) => `<li>${line(l)}</li>`).join('');
    await this.send({
      to,
      subject: copy.subject,
      text: `${copy.greeting}\n${copy.intro}\n${textLines}`,
      html: emailShell(`<p>${copy.greeting}</p><p>${copy.intro}</p><ul>${htmlLines}</ul>`),
    });
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

  /** Build a locale-prefixed link into the web app (e.g. the clubs directory). */
  private webLink(locale: ApiLocale, path: string): string {
    const base = this.env.APP_BASE_URL.replace(/\/$/, '');
    return `${base}/${locale}/${path.replace(/^\//, '')}`;
  }
}

function button(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;background:#14181b;color:#c7f000;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:700">${label}</a></p>`;
}

function emailShell(inner: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#14181b"><h2>PlaySlot</h2>${inner}</div>`;
}
