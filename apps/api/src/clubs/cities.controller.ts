import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { createCitySchema, type CreateCityInput } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { ClubsService } from './clubs.service';

/** Cities: the search filter's list, and the list admin forms pick from. */
@Controller('cities')
export class CitiesController {
  constructor(private readonly clubs: ClubsService) {}

  /** Default: cities with an active club. `?all=1`: every city, for admin forms. */
  @Public()
  @Get()
  list(@Query('all') all?: string) {
    return this.clubs.listCities(all === '1' || all === 'true');
  }

  /** Only a platform admin may introduce a new city (QA-02). */
  @Post()
  @HttpCode(200)
  @Roles(Role.PLATFORM_ADMIN)
  create(
    @Body(new ZodBody(createCitySchema)) body: CreateCityInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.createCity(body, userId);
  }
}
