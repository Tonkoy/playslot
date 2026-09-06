import { z } from 'zod';
import { SPORTS } from './enums';

/** Cross-club availability search (spec §15/§22 M9). */
export const searchQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  sport: z.enum(SPORTS).optional(),
  duration: z.coerce.number().int().min(15).max(240).optional(),
  cityId: z.coerce.number().int().positive().optional(),
  startMin: z.coerce.number().int().min(0).max(1440).optional(), // earliest local start
  endMin: z.coerce.number().int().min(0).max(1440).optional(), // latest local start
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchResultItem {
  club: {
    id: number;
    slug: string;
    name: string;
    cityName: string;
    surfaces: string[];
  };
  freeCount: number;
  fromPriceCents: number | null;
  currency: string;
  sampleTimes: string[]; // HH:mm of the first few free slots
}

export interface SearchResponse {
  date: string;
  results: SearchResultItem[];
}
