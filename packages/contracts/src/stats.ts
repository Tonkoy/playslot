import { z } from 'zod';

/** Admin dashboard: bookings, users, revenue and top coaches for a period. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const statsQuerySchema = z.object({
  /** Inclusive local dates (Europe/Sofia). Default: 1st of this month … today. */
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Platform view only: narrow to one club. */
  clubId: z.coerce.number().int().positive().optional(),
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export interface MoneyWindowDto {
  todayCents: number;
  weekCents: number;
  monthCents: number;
  periodCents: number;
}

export interface CoachStatDto {
  coachProfileId: number;
  name: string;
  hours: number; // 1 decimal
  revenueCents: number;
  lessons: number; // individual lessons
  groupSessions: number; // group trainings held
}

export interface DailyStatDto {
  date: string; // YYYY-MM-DD local
  revenueCents: number;
  bookings: number;
  newUsers: number;
}

export interface AdminStatsDto {
  scope: 'platform' | 'club';
  range: { from: string; to: string; today: string; weekStart: string; monthStart: string; timezone: string };
  currency: string;
  revenue: MoneyWindowDto & {
    /** Booked in the period but still awaiting payment. */
    pendingCents: number;
    /** Share of period revenue from group trainings. */
    groupCents: number;
  };
  bookings: {
    today: number;
    week: number;
    month: number;
    period: number;
    courts: number;
    lessons: number;
    groupSignups: number;
    cancelled: number;
    noShows: number;
  };
  users: {
    /** Platform: all accounts. Club: distinct customers who ever booked there. */
    total: number;
    newToday: number;
    newWeek: number;
    newMonth: number;
    newPeriod: number;
    /** Distinct people with a booking in the period. */
    activePeriod: number;
    suspended: number | null; // platform only
  };
  daily: DailyStatDto[];
  topCoaches: {
    byHours: CoachStatDto[];
    byRevenue: CoachStatDto[];
    byLessons: CoachStatDto[];
  };
}
