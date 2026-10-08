import { z } from 'zod';

/** Feedback on past bookings and group trainings; feeds coach ratings. */

export const FEEDBACK_KINDS = ['reservation', 'group'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const feedbackInputSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  id: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

/** Something the player attended and can rate (or already rated). */
export interface FeedbackItemDto {
  kind: FeedbackKind;
  id: number;
  clubId: number;
  clubName: string;
  /** Reservation type (COURT / LESSON) or 'GROUP' for group trainings. */
  type: string;
  /** Group training title, when there is one. */
  title: string | null;
  coachProfileId: number | null;
  coachName: string | null;
  startsAt: string;
  endsAt: string;
  myRating: number | null;
  myComment: string | null;
}

export interface CoachFeedbackDto {
  id: number;
  rating: number;
  comment: string | null;
  authorName: string;
  createdAt: string;
}

/** What a club sees: recent feedback on its courts, lessons and trainings. */
export interface ClubFeedbackDto {
  averageRating: number | null;
  count: number;
  items: Array<
    CoachFeedbackDto & {
      type: string;
      title: string | null;
      coachName: string | null;
      startsAt: string;
    }
  >;
}
