import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createGroupSessionSchema,
  openGameSchema,
  updateGroupSessionSchema,
  type CreateGroupSessionInput,
  type OpenGameInput,
  type UpdateGroupSessionInput,
} from '@playslot/contracts';
import { CurrentUser, Public } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { GroupSessionsService } from './group-sessions.service';

/**
 * Sessions people sign up for: a coach's group trainings and the games players
 * open on courts they booked. Public listing; signing up; the organiser's side.
 */
@Controller()
export class GroupSessionsController {
  constructor(private readonly sessions: GroupSessionsService) {}

  @Public()
  @Get('group-sessions')
  list(@Query('clubId') clubId?: string, @CurrentUser('id') userId?: number) {
    return this.sessions.list(clubId ? Number(clubId) : undefined, userId);
  }

  /** The sessions the signed-in user organises (must precede :id). */
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

  /** A player opens a court they booked to other players. */
  @Post('group-sessions/from-reservation')
  open(@CurrentUser('id') userId: number, @Body(new ZodBody(openGameSchema)) body: OpenGameInput) {
    return this.sessions.openGame(userId, body);
  }

  /** The organiser edits their own session. */
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

  /** The organiser lets in someone who asked to join. */
  @Post('group-sessions/:id/registrations/:userId/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Param('userId') player: string, @CurrentUser('id') userId: number) {
    return this.sessions.approve(Number(id), userId, Number(player));
  }

  /** The organiser declines a request, or takes someone off the list. */
  @Delete('group-sessions/:id/registrations/:userId')
  decline(@Param('id') id: string, @Param('userId') player: string, @CurrentUser('id') userId: number) {
    return this.sessions.decline(Number(id), userId, Number(player));
  }

  @Delete('group-sessions/:id')
  cancel(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.sessions.cancel(Number(id), userId);
  }
}
