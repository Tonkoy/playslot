import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  addMemberSchema,
  platformCreateClubSchema,
  type AddMemberInput,
  type PlatformCreateClubInput,
} from '@playslot/contracts';
import { Role } from '@playslot/db';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { ClubsService } from './clubs.service';

/** Platform-admin operations (spec §13). Requires the PLATFORM_ADMIN role. */
@Controller('platform')
@Roles(Role.PLATFORM_ADMIN)
export class PlatformController {
  constructor(private readonly clubs: ClubsService) {}

  @Get('clubs')
  listClubs() {
    return this.clubs.listAllClubs();
  }

  @Get('clubs/:id')
  getClub(@Param('id') id: string) {
    return this.clubs.getForAdmin(Number(id));
  }

  @Post('clubs')
  createClub(
    @Body(new ZodBody(platformCreateClubSchema)) body: PlatformCreateClubInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.createClubAsPlatform(body, userId);
  }

  @Post('clubs/:id/admins')
  addAdmin(
    @Param('id') id: string,
    @Body(new ZodBody(addMemberSchema)) body: AddMemberInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.addClubAdmin(Number(id), body, userId);
  }

  @Post('clubs/:id/activate')
  activate(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.clubs.setStatus(Number(id), 'ACTIVE', userId);
  }

  @Post('clubs/:id/suspend')
  suspend(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.clubs.setStatus(Number(id), 'SUSPENDED', userId);
  }

  @Post('clubs/:id/feature')
  feature(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.clubs.setFeatured(Number(id), true, userId);
  }

  @Post('clubs/:id/unfeature')
  unfeature(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.clubs.setFeatured(Number(id), false, userId);
  }
}
