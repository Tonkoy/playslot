import { z } from 'zod';

/** Favorites + reviews (spec §22 M9). */

export const addFavoriteSchema = z.object({ clubId: z.number().int().positive() });

export interface FavoriteClub {
  id: number;
  slug: string;
  name: string;
  cityName: string;
}

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export interface ReviewDto {
  id: number;
  rating: number;
  comment: string | null;
  authorName: string;
  createdAt: string;
}

export interface ClubReviews {
  averageRating: number | null; // rounded to 1 decimal
  count: number;
  reviews: ReviewDto[];
}
