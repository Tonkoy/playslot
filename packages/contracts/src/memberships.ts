import { z } from 'zod';

/** Membership plans grant a booking discount while active (spec §9). */
export const upsertMembershipPlanSchema = z.object({
  name: z.string().min(1).max(120),
  priceCents: z.number().int().min(0),
  durationDays: z.number().int().min(1).max(3650),
  discountPercent: z.number().int().min(0).max(100),
  active: z.boolean().optional(),
});
export type UpsertMembershipPlanInput = z.infer<typeof upsertMembershipPlanSchema>;

/** Staff grants a membership to a customer by email (payment handled offline for MVP). */
export const grantMembershipSchema = z.object({
  userEmail: z.string().email(),
  planId: z.number().int().positive(),
});

export interface MembershipPlanDto {
  id: number;
  name: string;
  priceCents: number;
  durationDays: number;
  discountPercent: number;
  active: boolean;
}

export interface MembershipDto {
  id: number;
  clubId: number;
  clubName: string;
  planName: string;
  discountPercent: number;
  validUntil: string;
  active: boolean;
}
