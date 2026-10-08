import { Injectable } from '@nestjs/common';
import type { PriceRuleDto, PricePreviewDto, UpsertPriceRuleInput } from '@playslot/contracts';
import { PricingError, resolvePrice, type PriceRuleLike } from '@playslot/domain';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

/** YYYY-MM-DD ⇄ Date, treating the date as UTC midnight (season boundaries). */
const toDate = (iso: string | null | undefined): Date | null => (iso ? new Date(`${iso}T00:00:00Z`) : null);
const toIso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Club price rules (spec §7). The matching logic lives in @playslot/domain so
 * the admin preview and real bookings can never disagree.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clubId: number): Promise<PriceRuleDto[]> {
    const rules = await this.prisma.priceRule.findMany({
      where: { clubId },
      include: { resource: { select: { name: true } } },
      // Same order the engine resolves in, so the list reads as the precedence.
      orderBy: [{ priority: 'desc' }, { id: 'desc' }],
    });
    return rules.map((r) => ({
      id: r.id,
      resourceId: r.resourceId,
      resourceName: r.resource?.name ?? null,
      serviceId: r.serviceId,
      weekdayMask: r.weekdayMask,
      startMin: r.startMin,
      endMin: r.endMin,
      validFrom: toIso(r.validFrom),
      validUntil: toIso(r.validUntil),
      durationMin: r.durationMin,
      priceCents: r.priceCents,
      currency: r.currency,
      priority: r.priority,
      active: r.active,
    }));
  }

  async create(clubId: number, input: UpsertPriceRuleInput): Promise<PriceRuleDto> {
    await this.assertResourceBelongs(clubId, input.resourceId ?? null);
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { currency: true } });
    if (!club) throw new AppException('not_found');

    const created = await this.prisma.priceRule.create({
      data: { clubId, currency: club.currency, ...this.toData(input) },
    });
    return (await this.list(clubId)).find((r) => r.id === created.id)!;
  }

  async update(clubId: number, ruleId: number, input: UpsertPriceRuleInput): Promise<PriceRuleDto> {
    await this.assertOwned(clubId, ruleId);
    await this.assertResourceBelongs(clubId, input.resourceId ?? null);
    await this.prisma.priceRule.update({ where: { id: ruleId }, data: this.toData(input) });
    return (await this.list(clubId)).find((r) => r.id === ruleId)!;
  }

  async remove(clubId: number, ruleId: number): Promise<void> {
    await this.assertOwned(clubId, ruleId);
    await this.prisma.priceRule.delete({ where: { id: ruleId } });
  }

  /**
   * What a given slot would cost under the club's current rules. Returns the
   * winning rule id so an admin can see which one applied — and an error
   * rather than a price when nothing matches, because an unmatched slot is
   * unbookable and that is worth surfacing before a player finds it.
   */
  async preview(
    clubId: number,
    query: { date: string; startMin: number; durationMin: number; resourceId?: number },
  ): Promise<PricePreviewDto> {
    const [club, rules] = await Promise.all([
      this.prisma.club.findUnique({ where: { id: clubId }, select: { currency: true } }),
      this.prisma.priceRule.findMany({ where: { clubId, active: true } }),
    ]);
    if (!club) throw new AppException('not_found');

    const date = new Date(`${query.date}T00:00:00Z`);
    const likes: PriceRuleLike[] = rules.map((r) => ({
      id: r.id,
      resourceId: r.resourceId,
      serviceId: r.serviceId,
      weekdayMask: r.weekdayMask,
      startMin: r.startMin,
      endMin: r.endMin,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      durationMin: r.durationMin,
      priceCents: r.priceCents,
      currency: r.currency,
      priority: r.priority,
      active: r.active,
    }));

    try {
      const res = resolvePrice(likes, {
        weekday: date.getUTCDay(),
        slotStartMin: query.startMin,
        slotEndMin: query.startMin + query.durationMin,
        durationMin: query.durationMin,
        date,
        resourceId: query.resourceId,
      });
      return { priceCents: res.priceCents, currency: club.currency, ruleId: res.ruleId, error: null };
    } catch (err) {
      if (err instanceof PricingError) {
        return { priceCents: null, currency: club.currency, ruleId: null, error: 'no_rule' };
      }
      throw err;
    }
  }

  private toData(input: UpsertPriceRuleInput) {
    return {
      resourceId: input.resourceId ?? null,
      serviceId: input.serviceId ?? null,
      weekdayMask: input.weekdayMask ?? null,
      startMin: input.startMin ?? null,
      endMin: input.endMin ?? null,
      validFrom: toDate(input.validFrom),
      validUntil: toDate(input.validUntil),
      durationMin: input.durationMin,
      priceCents: input.priceCents,
      priority: input.priority,
      active: input.active,
    };
  }

  /** A rule may only be edited through the club that owns it. */
  private async assertOwned(clubId: number, ruleId: number): Promise<void> {
    const found = await this.prisma.priceRule.findFirst({ where: { id: ruleId, clubId }, select: { id: true } });
    if (!found) throw new AppException('not_found');
  }

  /** …and may only target a court belonging to that same club. */
  private async assertResourceBelongs(clubId: number, resourceId: number | null): Promise<void> {
    if (resourceId === null) return;
    const found = await this.prisma.resource.findFirst({
      where: { id: resourceId, clubId },
      select: { id: true },
    });
    if (!found) throw new AppException('not_found');
  }
}
