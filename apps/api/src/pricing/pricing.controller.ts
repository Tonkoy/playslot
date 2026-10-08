import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { upsertPriceRuleSchema, type UpsertPriceRuleInput } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { PricingService } from './pricing.service';

const previewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.coerce.number().int().min(0).max(1440),
  durationMin: z.coerce.number().int().min(15).max(480),
  resourceId: z.coerce.number().int().positive().optional(),
});

/**
 * Club price rules (spec §7). Staff may read the club's prices; only a club
 * admin may change them.
 */
@Controller('clubs/:clubId/price-rules')
@UseGuards(ClubMembershipGuard)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  list(@Param('clubId') clubId: string) {
    return this.pricing.list(Number(clubId));
  }

  /** Dry-run the engine so an admin can check a rule before players meet it. */
  @Get('preview')
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  preview(@Param('clubId') clubId: string, @Query() query: Record<string, string>) {
    const parsed = previewSchema.parse(query);
    return this.pricing.preview(Number(clubId), parsed);
  }

  @Post()
  @ClubRoles(Role.CLUB_ADMIN)
  create(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(upsertPriceRuleSchema)) body: UpsertPriceRuleInput,
  ) {
    return this.pricing.create(Number(clubId), body);
  }

  @Patch(':ruleId')
  @ClubRoles(Role.CLUB_ADMIN)
  update(
    @Param('clubId') clubId: string,
    @Param('ruleId') ruleId: string,
    @Body(new ZodBody(upsertPriceRuleSchema)) body: UpsertPriceRuleInput,
  ) {
    return this.pricing.update(Number(clubId), Number(ruleId), body);
  }

  @Delete(':ruleId')
  @ClubRoles(Role.CLUB_ADMIN)
  async remove(@Param('clubId') clubId: string, @Param('ruleId') ruleId: string) {
    await this.pricing.remove(Number(clubId), Number(ruleId));
    return { ok: true };
  }
}
