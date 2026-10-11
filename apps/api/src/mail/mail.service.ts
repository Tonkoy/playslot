import { Inject, Injectable } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { SERVER_ENV } from '../config/app-config.module';
import { type ApiLocale, DEFAULT_LOCALE } from '../common/i18n';
import { MAIL_PROVIDER, type MailProvider, type SendEmailInput } from './mail-provider';

export type { SendEmailInput } from './mail-provider';

/** Everything a booking email shows about the reservation. */
export interface BookingInfo {
  clubName: string;
  when: string;
  priceCents: number;
  currency: string;
  /** Court(s), as shown in the calendar. */
  what?: string;
  coachName?: string | null;
  bookingRef?: number;
  cancellationNote?: string | null;
}

/**
 * Transactional email (spec §19). Delegates the actual transport to a
 * {@link MailProvider} chosen from env (Resend / SendGrid / console) — this is
 * the only transport seam, so the templated helpers below never change when the
 * provider does. All jobs must be idempotent at the caller; this just sends.
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
  ) {}

  async send(input: SendEmailInput): Promise<void> {
    await this.provider.send(input);
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
      template: {
        key: 'verify_email',
        data: {
          preheader: locale === 'en' ? 'One click and your account is active.' : 'Един клик и профилът ви е активен.',
          heading: locale === 'en' ? 'Confirm your email' : 'Потвърдете имейла си',
          intro: copy.body,
          cta_label: copy.cta,
          cta_url: link,
          expiry_note:
            locale === 'en'
              ? 'The link is valid for 24 hours. After that, request a new one from the sign-in page.'
              : 'Връзката е валидна 24 часа. След това заявете нова от страницата за вход.',
          site_url: this.siteUrl(),
        },
      },
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
      template: {
        key: 'welcome',
        data: {
          preheader:
            locale === 'en'
              ? 'Your account is ready — find a court or a coach.'
              : 'Профилът ви е готов — намерете корт или треньор.',
          heading: copy.greeting,
          intro: copy.body,
          steps:
            locale === 'en'
              ? [
                  { number: 1, text: 'Pick a club and a day — you see real availability.' },
                  { number: 2, text: 'Add a coach to the booking if you want a lesson.' },
                  { number: 3, text: 'Confirm the slot and get an email with the details.' },
                ]
              : [
                  { number: 1, text: 'Изберете клуб и ден — виждате реалната наличност.' },
                  { number: 2, text: 'Добавете треньор към резервацията, ако искате урок.' },
                  { number: 3, text: 'Потвърдете часа и получавате имейл с детайлите.' },
                ],
          cta_label: copy.cta,
          cta_url: this.webLink(locale, 'clubs'),
          site_url: this.siteUrl(),
        },
      },
    });
  }

  /** Invite an admin-created account (club admin, staff or coach) to set a password. */
  async sendAccountInvite(
    to: string,
    link: string,
    info: { clubName: string; role: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const roleLabel = ROLE_LABEL[locale][info.role] ?? info.role;
    const copy =
      locale === 'en'
        ? {
            subject: `You've been added to ${info.clubName} on PlaySlot`,
            body: `You've been added as ${roleLabel} at ${info.clubName}. Set your password to get started:`,
            cta: 'Set your password',
          }
        : {
            subject: `Добавени сте към ${info.clubName} в PlaySlot`,
            body: `Добавени сте като ${roleLabel} в ${info.clubName}. Задайте паролата си, за да започнете:`,
            cta: 'Задай парола',
          };
    await this.send({
      to,
      subject: copy.subject,
      text: `${copy.body}\n${link}`,
      html: emailShell(`<p>${copy.body}</p>${button(link, copy.cta)}<p>${link}</p>`),
    });
  }

  /** What a booking email shows in its details table. */
  private bookingDetails(info: BookingInfo, locale: ApiLocale): { label: string; value: string }[] {
    const l = (bg: string, en: string) => (locale === 'en' ? en : bg);
    const rows = [
      { label: l('Клуб', 'Club'), value: info.clubName },
      { label: l('Кога', 'When'), value: info.when },
    ];
    if (info.what) rows.push({ label: l('Корт', 'Court'), value: info.what });
    if (info.coachName) rows.push({ label: l('Треньор', 'Coach'), value: info.coachName });
    rows.push({
      label: l('Цена', 'Price'),
      value: `${(info.priceCents / 100).toFixed(2)} ${info.currency}`,
    });
    if (info.bookingRef) rows.push({ label: l('Номер', 'Reference'), value: `#${info.bookingRef}` });
    return rows;
  }

  /**
   * The club has approved the slot — the second half of the two-step booking
   * flow (the first is {@link sendBookingReceived}).
   */
  async sendConfirmation(
    to: string,
    info: BookingInfo,
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const price = `${(info.priceCents / 100).toFixed(2)} ${info.currency}`;
    const copy =
      locale === 'en'
        ? {
            subject: `Booking confirmed — ${info.clubName}`,
            body: `Your booking at ${info.clubName} on ${info.when} is confirmed. Total: ${price}.`,
            heading: 'Your slot is confirmed',
            intro: 'The club confirmed your booking. See you on court.',
            status: 'Confirmed',
          }
        : {
            subject: `Потвърдена резервация — ${info.clubName}`,
            body: `Резервацията ви в ${info.clubName} на ${info.when} е потвърдена. Общо: ${price}.`,
            heading: 'Часът ви е потвърден',
            intro: 'Клубът потвърди резервацията ви. Очакваме ви на корта.',
            status: 'Потвърдена',
          };
    await this.send({
      to,
      subject: copy.subject,
      text: copy.body,
      html: emailShell(`<p>${copy.body}</p>`),
      template: {
        key: 'booking_confirmed',
        data: {
          preheader: copy.intro,
          status_label: copy.status,
          heading: copy.heading,
          intro: copy.intro,
          details: this.bookingDetails(info, locale),
          cta_label: locale === 'en' ? 'View booking' : 'Виж резервацията',
          cta_url: this.webLink(locale, 'me/bookings'),
          cancellation_note: info.cancellationNote ?? null,
          site_url: this.siteUrl(),
        },
      },
    });
  }

  /**
   * The player's slot is held and the club has been asked to confirm it. Sent
   * the moment the booking is made, so nobody is left wondering.
   */
  async sendBookingReceived(
    to: string,
    info: BookingInfo,
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const price = `${(info.priceCents / 100).toFixed(2)} ${info.currency}`;
    const copy =
      locale === 'en'
        ? {
            subject: `Booking request received — ${info.clubName}`,
            body: `We've held ${info.when} at ${info.clubName} for you (${price}). The club will confirm it shortly.`,
            heading: 'We got your request',
            intro: 'We held the slot for you. The club will confirm it and you will get a second email.',
            status: 'Awaiting confirmation',
            note: "If the club doesn't confirm, the booking lapses and you owe nothing.",
          }
        : {
            subject: `Получена заявка за резервация — ${info.clubName}`,
            body: `Запазихме ${info.when} в ${info.clubName} за вас (${price}). Клубът ще потвърди скоро.`,
            heading: 'Получихме заявката ви',
            intro: 'Запазихме часа за вас. Клубът ще го потвърди и ще получите второ писмо.',
            status: 'Очаква потвърждение',
            note: 'Ако клубът не потвърди часа, резервацията отпада и не дължите нищо.',
          };
    await this.send({
      to,
      subject: copy.subject,
      text: copy.body,
      html: emailShell(`<p>${copy.body}</p>`),
      template: {
        key: 'booking_received',
        data: {
          preheader: copy.status,
          status_label: copy.status,
          heading: copy.heading,
          intro: copy.intro,
          details: this.bookingDetails(info, locale),
          cta_label: locale === 'en' ? 'View booking' : 'Виж резервацията',
          cta_url: this.webLink(locale, 'me/bookings'),
          note: copy.note,
          site_url: this.siteUrl(),
        },
      },
    });
  }

  /** Notify club admins/staff that a booking landed on their calendar (spec §19). */
  /**
   * Copy of every new booking to the platform inbox (PLATFORM_NOTIFY_EMAIL).
   * Distinct from the club's own notice: it names the club first and says
   * whether the slot still needs the club's confirmation, so whoever watches
   * info@ can see at a glance what happened and where.
   */
  async sendPlatformBookingNotice(
    to: string,
    info: BookingInfo & {
      customerName: string;
      customerEmail?: string | null;
      awaitingApproval: boolean;
      reservationType: string;
    },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const price = `${(info.priceCents / 100).toFixed(2)} ${info.currency}`;
    const en = locale === 'en';
    const state = info.awaitingApproval
      ? en
        ? 'awaiting the club’s confirmation'
        : 'очаква потвърждение от клуба'
      : en
        ? 'confirmed'
        : 'потвърдена';
    const subject = en
      ? `New booking — ${info.clubName} (${state})`
      : `Нова резервация — ${info.clubName} (${state})`;

    const rows: [string, string][] = [
      [en ? 'Club' : 'Клуб', info.clubName],
      [en ? 'When' : 'Кога', info.when],
      [en ? 'Court' : 'Корт', info.what ?? '—'],
      [en ? 'Customer' : 'Клиент', info.customerName],
      ...(info.customerEmail ? ([[en ? 'Email' : 'Имейл', info.customerEmail]] as [string, string][]) : []),
      ...(info.coachName ? ([[en ? 'Coach' : 'Треньор', info.coachName]] as [string, string][]) : []),
      [en ? 'Type' : 'Вид', info.reservationType],
      [en ? 'Price' : 'Цена', price],
      [en ? 'Status' : 'Статус', state],
      ...(info.bookingRef ? ([[en ? 'Reference' : 'Номер', `#${info.bookingRef}`]] as [string, string][]) : []),
    ];

    const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
    const html = emailShell(
      `<p>${subject}</p><table cellpadding="4" style="border-collapse:collapse">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="color:#7c877f">${k}</td><td style="font-weight:600">${v}</td></tr>`,
        )
        .join('')}</table>`,
    );
    await this.send({ to, subject, text, html });
  }

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

  /** Notify club admins/staff that a booking was cancelled (spec §19). */
  async sendStaffCancellationNotice(
    to: string,
    info: { clubName: string; when: string; customerName: string; what: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const copy =
      locale === 'en'
        ? {
            subject: `Booking cancelled — ${info.clubName}`,
            body: `${info.customerName}'s booking of ${info.what} on ${info.when} was cancelled. The slot is free again.`,
          }
        : {
            subject: `Отменена резервация — ${info.clubName}`,
            body: `Резервацията на ${info.customerName} за ${info.what} на ${info.when} беше отменена. Часът е свободен отново.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /** Notify the coach that a lesson booked with them was cancelled (spec §19). */
  async sendCoachCancellationNotice(
    to: string,
    info: { clubName: string; when: string; customerName: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const copy =
      locale === 'en'
        ? {
            subject: `Lesson cancelled — ${info.when}`,
            body: `The lesson with ${info.customerName} at ${info.clubName} on ${info.when} was cancelled.`,
          }
        : {
            subject: `Отменен урок — ${info.when}`,
            body: `Урокът с ${info.customerName} в ${info.clubName} на ${info.when} беше отменен.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /** Notify the customer their booking was moved to a new time/court (spec §19). */
  async sendReschedule(
    to: string,
    info: { clubName: string; when: string; previousWhen?: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const copy =
      locale === 'en'
        ? {
            subject: `Booking moved — ${info.clubName}`,
            body: `Your booking at ${info.clubName} moved to ${info.when}${info.previousWhen ? ` (was ${info.previousWhen})` : ''}.`,
          }
        : {
            subject: `Преместена резервация — ${info.clubName}`,
            body: `Резервацията ви в ${info.clubName} е преместена за ${info.when}${info.previousWhen ? ` (беше ${info.previousWhen})` : ''}.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /** Notify club admins/staff that a booking was moved (spec §19). */
  async sendStaffRescheduleNotice(
    to: string,
    info: { clubName: string; when: string; previousWhen?: string; customerName: string; what: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const prev = info.previousWhen ? ` (was ${info.previousWhen})` : '';
    const prevBg = info.previousWhen ? ` (беше ${info.previousWhen})` : '';
    const copy =
      locale === 'en'
        ? {
            subject: `Booking moved — ${info.clubName}`,
            body: `${info.customerName}'s ${info.what} moved to ${info.when}${prev}.`,
          }
        : {
            subject: `Преместена резервация — ${info.clubName}`,
            body: `Резервацията на ${info.customerName} за ${info.what} е преместена за ${info.when}${prevBg}.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /** Notify the coach that a lesson booked with them was moved (spec §19). */
  async sendCoachRescheduleNotice(
    to: string,
    info: { clubName: string; when: string; previousWhen?: string; customerName: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const prev = info.previousWhen ? ` (was ${info.previousWhen})` : '';
    const prevBg = info.previousWhen ? ` (беше ${info.previousWhen})` : '';
    const copy =
      locale === 'en'
        ? {
            subject: `Lesson moved — ${info.when}`,
            body: `Your lesson with ${info.customerName} at ${info.clubName} moved to ${info.when}${prev}.`,
          }
        : {
            subject: `Преместен урок — ${info.when}`,
            body: `Урокът ви с ${info.customerName} в ${info.clubName} е преместен за ${info.when}${prevBg}.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /** Payment receipt to the customer once a booking is marked paid (spec §19). */
  async sendPaymentReceipt(
    to: string,
    info: { clubName: string; when: string; priceCents: number; currency: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const price = `${(info.priceCents / 100).toFixed(2)} ${info.currency}`;
    const copy =
      locale === 'en'
        ? {
            subject: `Payment received — ${info.clubName}`,
            body: `We received your payment of ${price} for your booking at ${info.clubName} on ${info.when}. Thank you!`,
          }
        : {
            subject: `Получено плащане — ${info.clubName}`,
            body: `Получихме плащането ви от ${price} за резервацията в ${info.clubName} на ${info.when}. Благодарим!`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /** Notify the customer they were marked as a no-show (spec §19). */
  async sendNoShowNotice(
    to: string,
    info: { clubName: string; when: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const copy =
      locale === 'en'
        ? {
            subject: `Missed booking — ${info.clubName}`,
            body: `You were marked as a no-show for your booking at ${info.clubName} on ${info.when}.`,
          }
        : {
            subject: `Пропусната резервация — ${info.clubName}`,
            body: `Отбелязани сте като неявили се за резервацията в ${info.clubName} на ${info.when}.`,
          };
    await this.send({ to, subject: copy.subject, text: copy.body, html: emailShell(`<p>${copy.body}</p>`) });
  }

  /** Invite a player to a coach's new group session (spec §22). */
  async sendGroupSessionInvite(
    to: string,
    info: {
      coachName: string;
      clubName: string;
      when: string;
      title: string;
      spotsLeft: number;
      priceCents: number;
      currency: string;
    },
    link: string,
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const price = info.priceCents > 0 ? `${(info.priceCents / 100).toFixed(2)} ${info.currency}` : null;
    const copy =
      locale === 'en'
        ? {
            subject: `New group session with ${info.coachName} — ${info.when}`,
            body: `${info.coachName} is hosting “${info.title}” at ${info.clubName} on ${info.when}. ${info.spotsLeft} spots left${price ? `, ${price} per player` : ' (free)'}.`,
            cta: 'View & join',
          }
        : {
            subject: `Нова групова сесия с ${info.coachName} — ${info.when}`,
            body: `${info.coachName} организира „${info.title}“ в ${info.clubName} на ${info.when}. Оставащи места: ${info.spotsLeft}${price ? `, ${price} на играч` : ' (безплатно)'}.`,
            cta: 'Виж и се запиши',
          };
    await this.send({
      to,
      subject: copy.subject,
      text: `${copy.body}\n${link}`,
      html: emailShell(`<p>${copy.body}</p>${button(link, copy.cta)}`),
    });
  }

  /** Tell a registered player their group session was cancelled (spec §19). */
  async sendGroupSessionCancelled(
    to: string,
    info: { title: string; clubName: string; when: string },
    locale: ApiLocale = DEFAULT_LOCALE,
  ): Promise<void> {
    const copy =
      locale === 'en'
        ? {
            subject: `Group session cancelled — ${info.title}`,
            body: `“${info.title}” at ${info.clubName} on ${info.when} was cancelled by the coach.`,
          }
        : {
            subject: `Отменена групова сесия — ${info.title}`,
            body: `„${info.title}“ в ${info.clubName} на ${info.when} беше отменена от треньора.`,
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

  /**
   * Security notice sent after the password is successfully changed (spec §19).
   * Links back to the reset flow so a user who didn't do this can re-secure.
   */
  async sendPasswordChanged(to: string, locale: ApiLocale = DEFAULT_LOCALE): Promise<void> {
    const link = this.webLink(locale, 'forgot-password');
    const copy =
      locale === 'en'
        ? {
            subject: 'Your PlaySlot password was changed',
            body: "Your password was just changed. If this wasn't you, reset it immediately and contact support.",
            cta: 'Reset password',
          }
        : {
            subject: 'Паролата ви в PlaySlot беше сменена',
            body: 'Паролата ви току-що беше сменена. Ако не сте вие, сменете я веднага и се свържете с поддръжка.',
            cta: 'Смени паролата',
          };
    await this.send({
      to,
      subject: copy.subject,
      text: `${copy.body}\n${link}`,
      html: emailShell(`<p>${copy.body}</p>${button(link, copy.cta)}`),
    });
  }

  /** Build a locale-prefixed link into the web app (e.g. the clubs directory). */
  /** Site root, for template footers. */
  private siteUrl(): string {
    return this.env.APP_BASE_URL.replace(/\/$/, '');
  }

  private webLink(locale: ApiLocale, path: string): string {
    const base = this.env.APP_BASE_URL.replace(/\/$/, '');
    return `${base}/${locale}/${path.replace(/^\//, '')}`;
  }
}

const ROLE_LABEL: Record<ApiLocale, Record<string, string>> = {
  en: { CLUB_ADMIN: 'club admin', CLUB_STAFF: 'staff', COACH: 'coach' },
  bg: { CLUB_ADMIN: 'администратор на клуб', CLUB_STAFF: 'персонал', COACH: 'треньор' },
};

function button(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;background:#14181b;color:#c7f000;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:700">${label}</a></p>`;
}

function emailShell(inner: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#14181b"><h2>PlaySlot</h2>${inner}</div>`;
}
