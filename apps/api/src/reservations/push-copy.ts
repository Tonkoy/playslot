import type { ApiLocale } from '../common/i18n';
import type { PushMessage } from '../push/push.service';

/** What happened to a booking, as far as a push notification is concerned. */
export type BookingPushKind = 'awaiting' | 'booked' | 'cancelled' | 'moved';

export interface BookingPushInfo {
  reservationId: number;
  clubId: number;
  clubName: string;
  customerName: string;
  /** Court (and coach) names, e.g. "Корт 3 + Явор Димитров". */
  what: string;
  /** Start in the club's time, "dd.MM HH:mm". */
  when: string;
  /** Start day in the club's time, YYYY-MM-DD — opens the calendar on that day. */
  day: string;
  /** Where it was before a move, same format as `when`. */
  previousWhen?: string;
}

const STAFF_TITLE: Record<BookingPushKind, Record<ApiLocale, string>> = {
  awaiting: { bg: 'Резервация чака одобрение', en: 'Booking awaiting approval' },
  booked: { bg: 'Нова резервация', en: 'New booking' },
  cancelled: { bg: 'Отменена резервация', en: 'Booking cancelled' },
  moved: { bg: 'Преместена резервация', en: 'Booking moved' },
};

const COACH_TITLE: Record<Exclude<BookingPushKind, 'awaiting'>, Record<ApiLocale, string>> = {
  booked: { bg: 'Нова тренировка с теб', en: 'New lesson with you' },
  cancelled: { bg: 'Отменена тренировка', en: 'Lesson cancelled' },
  moved: { bg: 'Преместена тренировка', en: 'Lesson moved' },
};

const whenLine = (i: BookingPushInfo) => (i.previousWhen ? `${i.previousWhen} → ${i.when}` : i.when);

/** For the club's admins and staff; a tap opens the club calendar on that day. */
export function staffBookingPush(kind: BookingPushKind, locale: ApiLocale, i: BookingPushInfo): PushMessage {
  return {
    title: `${STAFF_TITLE[kind][locale]} · ${i.clubName}`,
    body: `${i.customerName} · ${i.what} · ${whenLine(i)}`,
    url: `/${locale}/admin/clubs/${i.clubId}/calendar?date=${i.day}`,
    // One notification per booking: a move or a cancellation replaces "new".
    tag: `booking-${i.reservationId}`,
  };
}

/** For the coach of a lesson; a tap opens their schedule. */
export function coachBookingPush(
  kind: Exclude<BookingPushKind, 'awaiting'>,
  locale: ApiLocale,
  i: BookingPushInfo,
): PushMessage {
  return {
    title: COACH_TITLE[kind][locale],
    body: `${i.customerName} · ${whenLine(i)} · ${i.clubName}`,
    url: `/${locale}/me/schedule`,
    tag: `lesson-${i.reservationId}`,
  };
}
