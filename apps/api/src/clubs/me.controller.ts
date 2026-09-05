import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { ClubsService } from './clubs.service';

/** Current-user scoped reads for the admin console (spec §16). */
@Controller('me')
export class MeController {
  constructor(private readonly clubs: ClubsService) {}

  @Get('clubs')
  myClubs(@CurrentUser('id') userId: number) {
    return this.clubs.listMyClubs(userId);
  }
}
