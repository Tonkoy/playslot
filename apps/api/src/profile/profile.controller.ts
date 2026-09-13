import { Body, Controller, Get, Put } from '@nestjs/common';
import { updateUserProfileSchema, type UpdateUserProfileInput } from '@playslot/contracts';
import { CurrentUser } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { ProfileService } from './profile.service';

/** The signed-in user's own account profile (read + edit). */
@Controller('me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('profile')
  get(@CurrentUser('id') userId: number) {
    return this.profile.getMyProfile(userId);
  }

  @Put('profile')
  update(
    @CurrentUser('id') userId: number,
    @Body(new ZodBody(updateUserProfileSchema)) body: UpdateUserProfileInput,
  ) {
    return this.profile.updateMyProfile(userId, body);
  }
}
