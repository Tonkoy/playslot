import { describe, expect, it } from 'vitest';
import { coachBookingPush, staffBookingPush, type BookingPushInfo } from './push-copy';

const info: BookingPushInfo = {
  reservationId: 42,
  clubId: 7,
  clubName: '360 Тенис клуб',
  customerName: 'Иван Петров',
  what: 'Корт 3',
  when: '26.11 18:00',
  day: '2026-11-26',
};

describe('booking push copy', () => {
  it('tells club staff who booked what and when, and opens the calendar on that day', () => {
    const m = staffBookingPush('booked', 'bg', info);
    expect(m.title).toBe('Нова резервация · 360 Тенис клуб');
    expect(m.body).toBe('Иван Петров · Корт 3 · 26.11 18:00');
    expect(m.url).toBe('/bg/admin/clubs/7/calendar?date=2026-11-26');
    expect(m.tag).toBe('booking-42');
  });

  it('shows where a moved booking came from', () => {
    const m = staffBookingPush('moved', 'en', { ...info, previousWhen: '26.11 17:00' });
    expect(m.title).toBe('Booking moved · 360 Тенис клуб');
    expect(m.body).toBe('Иван Петров · Корт 3 · 26.11 17:00 → 26.11 18:00');
    expect(m.url).toBe('/en/admin/clubs/7/calendar?date=2026-11-26');
  });

  it('sends the coach to their own schedule', () => {
    const m = coachBookingPush('booked', 'bg', info);
    expect(m.title).toBe('Нова тренировка с теб');
    expect(m.body).toBe('Иван Петров · 26.11 18:00 · 360 Тенис клуб');
    expect(m.url).toBe('/bg/me/schedule');
    expect(coachBookingPush('cancelled', 'en', info).title).toBe('Lesson cancelled');
  });
});
