import { Controller, Param, Post } from '@nestjs/common';
import { Role } from '@playslot/db';
import { CurrentUser, Roles } from '../auth/decorators';
import { ClubsService } from './clubs.service';

/** Platform-admin operations (spec §13). Requires the PLATFORM_ADMIN role. */
@Controller('platform')
@Roles(Role.PLATFORM_ADMIN)
export class PlatformController {
  constructor(private readonly clubs: ClubsService) {}

  @Post('clubs/:id/activate')
  activate(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.clubs.setStatus(Number(id), 'ACTIVE', userId);
  }

  @Post('clubs/:id/suspend')
  suspend(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.clubs.setStatus(Number(id), 'SUSPENDED', userId);
  }
}
