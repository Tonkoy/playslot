import { Injectable } from '@nestjs/common';
import { type EventDto, type UpsertEventInput } from '@playslot/contracts';
import { type ReservationType } from '@playslot/db';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Events & tournaments with public registration (spec §22 M9). "Programs" to
 * avoid clashing with the SSE EventsModule; routes are /events + /clubs/:id/events.
 */
@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clubId: number | undefined, userId?: number): Promise<EventDto[]> {
    const rows = await this.prisma.event.findMany({
      where: { published: true, endsAt: { gt: new Date() }, ...(clubId ? { clubId } : {}) },
      include: {
        club: { select: { name: true } },
        _count: { select: { registrations: true } },
        registrations: userId ? { where: { userId }, select: { id: true } } : false,
      },
      orderBy: { startsAt: 'asc' },
      take: 100,
    });
    return rows.map((e) => this.toDto(e));
  }

  async getOne(id: number, userId?: number): Promise<EventDto> {
    const e = await this.prisma.event.findUnique({
      where: { id },
      include: {
        club: { select: { name: true } },
        _count: { select: { registrations: true } },
        registrations: userId ? { where: { userId }, select: { id: true } } : false,
      },
    });
    if (!e) throw new AppException('not_found');
    return this.toDto(e);
  }

  // ── admin CRUD ──
  async create(clubId: number, input: UpsertEventInput) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new AppException('validation_failed', { fields: { endsAt: ['must be after start'] } });
    }
    return this.prisma.event.create({
      data: {
        clubId,
        type: input.type as ReservationType,
        title: input.title,
        description: input.description ?? null,
        startsAt,
        endsAt,
        capacity: input.capacity,
        feeCents: input.feeCents,
        published: input.published ?? true,
      },
    });
  }

  async update(clubId: number, eventId: number, input: UpsertEventInput) {
    const existing = await this.prisma.event.findFirst({ where: { id: eventId, clubId } });
    if (!existing) throw new AppException('not_found');
    return this.prisma.event.update({
      where: { id: eventId },
      data: {
        type: input.type as ReservationType,
        title: input.title,
        description: input.description ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        capacity: input.capacity,
        feeCents: input.feeCents,
        published: input.published ?? true,
      },
    });
  }

  // ── registration ──
  async register(eventId: number, userId: number) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { _count: { select: { registrations: true } } },
    });
    if (!event || !event.published) throw new AppException('not_found');
    if (event.endsAt <= new Date()) throw new AppException('policy_violation', { reason: 'ended' });

    // Serialize capacity check + insert to avoid oversubscription under races.
    try {
      return await this.prisma.$transaction(async (tx) => {
        const count = await tx.eventRegistration.count({ where: { eventId } });
        if (count >= event.capacity) throw new AppException('policy_violation', { reason: 'full' });
        await tx.eventRegistration.create({ data: { eventId, userId } });
        return { ok: true as const, spotsLeft: event.capacity - count - 1 };
      });
    } catch (e) {
      // Unique violation ⇒ already registered (idempotent success).
      if (e instanceof Error && e.message.includes('Unique constraint')) {
        return { ok: true as const, spotsLeft: Math.max(0, event.capacity - event._count.registrations) };
      }
      throw e;
    }
  }

  async unregister(eventId: number, userId: number) {
    await this.prisma.eventRegistration.deleteMany({ where: { eventId, userId } });
    return { ok: true as const };
  }

  private toDto(
    e: {
      id: number;
      clubId: number;
      type: string;
      title: string;
      description: string | null;
      startsAt: Date;
      endsAt: Date;
      capacity: number;
      feeCents: number;
      club?: { name: string };
      _count: { registrations: number };
      registrations?: { id: number }[] | false;
    },
  ): EventDto {
    const registeredCount = e._count.registrations;
    return {
      id: e.id,
      clubId: e.clubId,
      clubName: e.club?.name,
      type: e.type,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      capacity: e.capacity,
      feeCents: e.feeCents,
      registeredCount,
      spotsLeft: Math.max(0, e.capacity - registeredCount),
      registered: Array.isArray(e.registrations) ? e.registrations.length > 0 : false,
      // userId used only to shape the query include above
    };
  }
}
