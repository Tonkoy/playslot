import type { ApiLocale } from '../common/i18n';
import type { PushMessage } from '../push/push.service';

/**
 * What can happen around a session people sign up for, as far as telling
 * someone is concerned. The first three go to the organiser; the rest to a
 * player who signed up.
 */
export type GameEvent = 'joined' | 'requested' | 'left' | 'approved' | 'declined' | 'cancelled' | 'moved';

export interface GameInfo {
  sessionId: number;
  title: string;
  clubName: string;
  /** Start in the club's time, "dd.MM HH:mm". */
  when: string;
  /** Where it was before a move, same format. */
  previousWhen?: string;
  /** The player the event is about (joined / requested / left). */
  playerName?: string;
  /** Places taken and places in all, after the event. */
  taken?: number;
  capacity?: number;
}

export interface GameNotice {
  push: PushMessage;
  mail: {
    subject: string;
    heading: string;
    intro: string;
    status: string;
    tone: 'good' | 'warn' | 'plain';
    ctaLabel: string;
  };
  /** Site path (after the locale) the push and the email button open. */
  path: string;
}

const q = (locale: ApiLocale, s: string) => (locale === 'en' ? `“${s}”` : `„${s}“`);

/** The words for one event, in one language: a push and an email saying the same thing. */
export function gameNotice(event: GameEvent, locale: ApiLocale, i: GameInfo): GameNotice {
  const en = locale === 'en';
  const title = q(locale, i.title);
  const who = i.playerName ?? (en ? 'A player' : 'Играч');
  const places = i.taken != null && i.capacity != null ? (en ? `${i.taken}/${i.capacity} places taken` : `${i.taken}/${i.capacity} места заети`) : null;
  const line = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  // Every notice opens the list, scrolled to this session.
  const path = `sessions#gs-${i.sessionId}`;
  const tag = `game-${i.sessionId}-${event}`;

  const make = (
    head: string,
    body: string,
    mail: { status: string; tone: 'good' | 'warn' | 'plain'; ctaLabel: string; intro?: string },
  ): GameNotice => ({
    push: { title: head, body, url: `/${locale}/${path}`, tag },
    mail: { subject: head, heading: head, intro: mail.intro ?? body, status: mail.status, tone: mail.tone, ctaLabel: mail.ctaLabel },
    path,
  });

  switch (event) {
    case 'joined':
      return make(en ? `${who} joined ${title}` : `${who} се записа за ${title}`, line(i.when, i.clubName, places), {
        status: en ? 'New player' : 'Нов играч',
        tone: 'good',
        ctaLabel: en ? 'See who is coming' : 'Виж кой ще дойде',
      });
    case 'requested':
      return make(
        en ? `${who} asks to join ${title}` : `${who} иска да се включи в ${title}`,
        line(i.when, i.clubName, en ? 'Let them in or decline.' : 'Одобри или откажи.'),
        { status: en ? 'Waiting for you' : 'Чака те', tone: 'plain', ctaLabel: en ? 'Answer the request' : 'Отговори на заявката' },
      );
    case 'left':
      return make(en ? `${who} left ${title}` : `${who} се отписа от ${title}`, line(i.when, i.clubName, places), {
        status: en ? 'A place is free' : 'Освободи се място',
        tone: 'warn',
        ctaLabel: en ? 'See who is coming' : 'Виж кой ще дойде',
      });
    case 'approved':
      return make(en ? `You are in: ${title}` : `Имаш място в ${title}`, line(i.when, i.clubName), {
        status: en ? 'Approved' : 'Одобрен',
        tone: 'good',
        ctaLabel: en ? 'See the game' : 'Виж играта',
      });
    case 'declined':
      return make(
        en ? `No place for you in ${title}` : `Няма място за теб в ${title}`,
        line(i.when, i.clubName, en ? 'The organiser did not confirm you.' : 'Организаторът не те потвърди.'),
        { status: en ? 'Not confirmed' : 'Без потвърждение', tone: 'warn', ctaLabel: en ? 'See other games' : 'Виж други игри' },
      );
    case 'cancelled':
      return make(
        en ? `Called off: ${title}` : `Отменена: ${title}`,
        line(i.when, i.clubName, en ? 'The organiser called it off.' : 'Организаторът я отмени.'),
        { status: en ? 'Cancelled' : 'Отменена', tone: 'warn', ctaLabel: en ? 'See other games' : 'Виж други игри' },
      );
    case 'moved':
      return make(
        en ? `Moved: ${title}` : `Преместена: ${title}`,
        line(i.previousWhen ? `${i.previousWhen} → ${i.when}` : i.when, i.clubName, en ? 'Your place is kept.' : 'Мястото ти е запазено.'),
        { status: en ? 'Moved' : 'Преместена', tone: 'warn', ctaLabel: en ? 'See the game' : 'Виж играта' },
      );
  }
}
