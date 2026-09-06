import { Injectable } from '@nestjs/common';
import {
  type MembershipDto,
  type MembershipPlanDto,
  type UpsertMembershipPlanInput,
} from '@playslot/contracts';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Best member discount % for a user at a club right now (0 if none). Used by pricing. */
  async discountPercent(clubId: number, userId?: number): Promise<number> {
    if (!userId) return 0;
    const memberships = await this.prisma.membership.findMany({
      where: { clubId, userId, validUntil: { gt: new Date() } },
      select: { plan: { select: { discountPercent: true } } },
    });
    return memberships.reduce((max, m) => Math.max(max, m.plan.discountPercent), 0);
  }

  // ── plans ──
  listPlans(clubId: number, onlyActive = false): Promise<MembershipPlanDto[]> {
    return this.prisma.membershipPlan.findMany({
      where: { clubId, ...(onlyActive ? { active: true } : {}) },
      orderBy: { priceCents: 'asc' },
    }) as unknown as Promise<MembershipPlanDto[]>;
  }

  async createPlan(clubId: number, input: UpsertMembershipPlanInput) {
    return this.prisma.membershipPlan.create({
      data: {
        clubId,
        name: input.name,
        priceCents: input.priceCents,
        durationDays: input.durationDays,
        discountPercent: input.discountPercent,
        active: input.active ?? true,
      },
    });
  }

  async updatePlan(clubId: number, planId: number, input: UpsertMembershipPlanInput) {
    const existing = await this.prisma.membershipPlan.findFirst({ where: { id: planId, clubId } });
    if (!existing) throw new AppException('not_found');
    return this.prisma.membershipPlan.update({
      where: { id: planId },
      data: {
        name: input.name,
        priceCents: input.priceCents,
        durationDays: input.durationDays,
        discountPercent: input.discountPercent,
        active: input.active ?? true,
      },
    });
  }

  // ── grants ──
  async grant(clubId: number, userEmail: string, planId: number) {
    const plan = await this.prisma.membershipPlan.findFirst({ where: { id: planId, clubId } });
    if (!plan) throw new AppException('not_found', { reason: 'plan' });
    const user = await this.prisma.user.findUnique({ where: { email: userEmail.toLowerCase() } });
    if (!user) throw new AppException('not_found', { reason: 'user' });

    const validUntil = new Date(Date.now() + plan.durationDays * 86_400_000);
    const membership = await this.prisma.membership.create({
      data: { clubId, userId: user.id, planId, validUntil },
    });
    return { id: membership.id, userId: user.id, validUntil: validUntil.toISOString() };
  }

  async listMine(userId: number): Promise<MembershipDto[]> {
    const rows = await this.prisma.membership.findMany({
      where: { userId },
      select: {
        id: true,
        clubId: true,
        validUntil: true,
        club: { select: { name: true } },
        plan: { select: { name: true, discountPercent: true } },
      },
      orderBy: { validUntil: 'desc' },
    });
    const now = Date.now();
    return rows.map((m) => ({
      id: m.id,
      clubId: m.clubId,
      clubName: m.club.name,
      planName: m.plan.name,
      discountPercent: m.plan.discountPercent,
      validUntil: m.validUntil.toISOString(),
      active: m.validUntil.getTime() > now,
    }));
  }
}

/** Apply a member discount to a base price (integer cents, half-up). */
export function applyDiscount(baseCents: number, discountPercent: number): number {
  if (discountPercent <= 0) return baseCents;
  return Math.round((baseCents * (100 - discountPercent)) / 100);
}
