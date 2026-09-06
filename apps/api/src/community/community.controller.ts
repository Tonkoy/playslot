import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { addFavoriteSchema, reviewInputSchema } from '@playslot/contracts';
import { CurrentUser, Public } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { CommunityService } from './community.service';

/** Favorites (authenticated) + reviews (public read, authenticated write). */
@Controller()
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('me/favorites')
  listFavorites(@CurrentUser('id') userId: number) {
    return this.community.listFavorites(userId);
  }

  @Post('me/favorites')
  @HttpCode(200)
  addFavorite(
    @Body(new ZodBody(addFavoriteSchema)) body: { clubId: number },
    @CurrentUser('id') userId: number,
  ) {
    return this.community.addFavorite(userId, body.clubId);
  }

  @Delete('me/favorites/:clubId')
  removeFavorite(@Param('clubId') clubId: string, @CurrentUser('id') userId: number) {
    return this.community.removeFavorite(userId, Number(clubId));
  }

  @Public()
  @Get('clubs/:id/reviews')
  listReviews(@Param('id') id: string) {
    return this.community.listReviews(Number(id));
  }

  @Post('clubs/:id/reviews')
  @HttpCode(200)
  upsertReview(
    @Param('id') id: string,
    @Body(new ZodBody(reviewInputSchema)) body: import('@playslot/contracts').ReviewInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.community.upsertReview(Number(id), userId, body);
  }
}
