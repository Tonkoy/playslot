import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { ClubsService } from './clubs.service';

/** Public list of cities that have active clubs (search location filter). */
@Controller('cities')
export class CitiesController {
  constructor(private readonly clubs: ClubsService) {}

  @Public()
  @Get()
  list() {
    return this.clubs.listCities();
  }
}
