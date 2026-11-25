import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createGroupSessionSchema,
  updateGroupSessionSchema,
  type CreateGroupSessionInput,
  type UpdateGroupSessionInput,
} from '@playslot/contracts';
import { CurrentUser, Public } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { GroupSessionsService } from './group-sessions.service';

/** Coach-hosted group sessions: public listing + registration, coach create/cancel. */
@Controller()
export class GroupSessionsController {
  constructor(private readonly sessions: GroupSessionsService) {}

  @Public()
  @Get('group-sessions')
  list(@Query('clubId') clubId?: string, @CurrentUser('id') userId?: number) {
    return this.sessions.list(clubId ? Number(clubId) : undefined, userId);
  }

  /** The signed-in coach's own sessions (must precede :id). */
  @Get('group-sessions/mine')
  mine(@CurrentUser('id') userId: number) {
    return this.sessions.listMine(userId);
  }

  @Public()
  @Get('group-sessions/:id')
  get(@Param('id') id: string, @CurrentUser('id') userId?: number) {
    return this.sessions.getOne(Number(id), userId);
  }

  @Post('group-sessions')
  create(
    @CurrentUser('id') userId: number,
    @Body(new ZodBody(createGroupSessionSchema)) body: CreateGroupSessionInput,
  ) {
    return this.sessions.create(userId, body);
  }

  /** The coach edits their own session (words, size, price, level, day and hour). */
  @Patch('group-sessions/:id')
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @Body(new ZodBody(updateGroupSessionSchema)) body: UpdateGroupSessionInput,
  ) {
    return this.sessions.update(Number(id), userId, body);
  }

  @Post('group-sessions/:id/register')
  @HttpCode(200)
  register(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.sessions.register(Number(id), userId);
  }

  @Delete('group-sessions/:id/register')
  unregister(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.sessions.unregister(Number(id), userId);
  }

  @Delete('group-sessions/:id')
  cancel(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.sessions.cancel(Number(id), userId);
  }
}
