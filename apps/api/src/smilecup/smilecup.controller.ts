import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@playslot/db';
import { z } from 'zod';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, CurrentUser } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { SmileCupService } from './smilecup.service';

const windowSchema = z
  .object({
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    courtIds: z.array(z.number().int().positive()).min(1).max(50),
  })
  .refine((w) => w.endMin > w.startMin, { path: ['endMin'], message: 'end_before_start' });
type BlockWindowInput = z.infer<typeof windowSchema>;

/** Smile Cup tournaments → blocked courts (club staff and admins only). */
@Controller('clubs/:clubId/smilecup/tournaments')
@UseGuards(ClubMembershipGuard)
@ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
export class SmileCupController {
  constructor(private readonly smilecup: SmileCupService) {}

  @Get()
  list(@Param('clubId') clubId: string) {
    return this.smilecup.list(Number(clubId));
  }

  @Post(':id/preview')
  preview(@Param('clubId') clubId: string, @Param('id') id: string, @Body(new ZodBody(windowSchema)) body: BlockWindowInput) {
    return this.smilecup.preview(Number(clubId), id, body);
  }

  @Post(':id/block')
  block(
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body(new ZodBody(windowSchema)) body: BlockWindowInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.smilecup.block(Number(clubId), id, body, userId);
  }

  @Post(':id/release')
  release(@Param('clubId') clubId: string, @Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.smilecup.release(Number(clubId), id, userId);
  }
}
