import { Injectable } from '@nestjs/common';
import {
  type AvailabilityRuleInput,
  type UpsertCourtInput,
} from '@playslot/contracts';
import { type Prisma } from '@playslot/db';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  listCourts(clubId: number) {
    return this.prisma.resource.findMany({
      where: { clubId, type: 'COURT' },
      orderBy: { name: 'asc' },
      include: { availabilityRules: { orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] } },
    });
  }

  async createCourt(clubId: number, input: UpsertCourtInput, actorUserId: number) {
    const court = await this.prisma.resource.create({
      data: {
        clubId,
        type: 'COURT',
        name: input.name,
        sport: input.sport,
        surface: input.surface ?? null,
        isIndoor: input.isIndoor ?? null,
        hasLighting: input.hasLighting ?? null,
        minReservationMin: input.minReservationMin,
        slotIntervalMin: input.slotIntervalMin,
        allowHalfHour: input.allowHalfHour,
      },
    });
    await this.audit(actorUserId, 'court.create', court.id, null, court);
    return court;
  }

  async updateCourt(
    clubId: number,
    courtId: number,
    input: UpsertCourtInput,
    actorUserId: number,
  ) {
    const before = await this.requireCourt(clubId, courtId);
    // Tenant guard: updateMany scoped to clubId so Club A can never touch Club B.
    await this.prisma.resource.updateMany({
      where: { id: courtId, clubId, type: 'COURT' },
      data: {
        name: input.name,
        sport: input.sport,
        surface: input.surface ?? null,
        isIndoor: input.isIndoor ?? null,
        hasLighting: input.hasLighting ?? null,
        minReservationMin: input.minReservationMin,
        slotIntervalMin: input.slotIntervalMin,
        allowHalfHour: input.allowHalfHour,
      },
    });
    const after = await this.prisma.resource.findUnique({ where: { id: courtId } });
    await this.audit(actorUserId, 'court.update', courtId, before, after);
    return after;
  }

  async setCourtStatus(
    clubId: number,
    courtId: number,
    status: 'ACTIVE' | 'INACTIVE',
    actorUserId: number,
  ) {
    const before = await this.requireCourt(clubId, courtId);
    await this.prisma.resource.updateMany({
      where: { id: courtId, clubId, type: 'COURT' },
      data: { status },
    });
    await this.audit(actorUserId, `court.${status.toLowerCase()}`, courtId, before, { status });
    return { id: courtId, status };
  }

  // ── availability rules (replace-all for a court) ──
  async getAvailability(clubId: number, courtId: number) {
    await this.requireCourt(clubId, courtId);
    return this.prisma.availabilityRule.findMany({
      where: { resourceId: courtId },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    });
  }

  async setAvailability(
    clubId: number,
    courtId: number,
    rules: AvailabilityRuleInput[],
    actorUserId: number,
  ) {
    await this.requireCourt(clubId, courtId);
    for (const r of rules) {
      if (r.endMin <= r.startMin) {
        throw new AppException('validation_failed', {
          fields: { endMin: ['endMin must be greater than startMin'] },
        });
      }
    }
    await this.prisma.$transaction([
      this.prisma.availabilityRule.deleteMany({ where: { resourceId: courtId } }),
      this.prisma.availabilityRule.createMany({
        data: rules.map((r) => ({ resourceId: courtId, ...r })),
      }),
    ]);
    await this.audit(actorUserId, 'court.availability.set', courtId, null, { count: rules.length });
    return this.getAvailability(clubId, courtId);
  }

  /** Load a court that belongs to the club, or 404 — the isolation checkpoint. */
  private async requireCourt(clubId: number, courtId: number) {
    const court = await this.prisma.resource.findFirst({
      where: { id: courtId, clubId, type: 'COURT' },
    });
    if (!court) throw new AppException('not_found');
    return court;
  }

  private audit(
    actorUserId: number | null,
    action: string,
    objectId: number,
    before: unknown,
    after: unknown,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId,
        action,
        objectType: 'Resource',
        objectId,
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      },
    });
  }
}
