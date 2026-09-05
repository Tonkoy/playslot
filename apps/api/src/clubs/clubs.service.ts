import { Injectable } from '@nestjs/common';
import { type ClubJoinRequestInput, type UpsertClubInput } from '@playslot/contracts';
import { type Prisma, Role } from '@playslot/db';
import { AppException } from '../common/app-exception';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/password';

const PUBLIC_CLUB_SELECT = {
  id: true,
  slug: true,
  name: true,
  address: true,
  lat: true,
  lng: true,
  timezone: true,
  currency: true,
  description: true,
  slotIntervalMin: true,
  acceptsMultisport: true,
  paymentMethods: true,
  status: true,
  cityId: true,
  city: { select: { id: true, name: true } },
} satisfies Prisma.ClubSelect;

const PUBLIC_COURT_SELECT = {
  id: true,
  name: true,
  sport: true,
  surface: true,
  isIndoor: true,
  hasLighting: true,
  minReservationMin: true,
  slotIntervalMin: true,
  allowHalfHour: true,
} satisfies Prisma.ResourceSelect;

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ── public reads (only ACTIVE clubs are visible) ──
  listPublic() {
    return this.prisma.club.findMany({
      where: { status: 'ACTIVE' },
      select: PUBLIC_CLUB_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async getPublic(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug)
      ? { id: Number(idOrSlug) }
      : { slug: idOrSlug };
    const club = await this.prisma.club.findFirst({
      where: { ...where, status: 'ACTIVE' },
      select: PUBLIC_CLUB_SELECT,
    });
    if (!club) throw new AppException('not_found');
    return club;
  }

  async getCourtsPublic(idOrSlug: string) {
    const club = await this.getPublic(idOrSlug);
    return this.prisma.resource.findMany({
      where: { clubId: club.id, type: 'COURT', status: 'ACTIVE' },
      select: PUBLIC_COURT_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async getCoachesPublic(idOrSlug: string) {
    const club = await this.getPublic(idOrSlug);
    return this.prisma.resource.findMany({
      where: { clubId: club.id, type: 'COACH', status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        coachProfile: {
          select: {
            id: true,
            bio: true,
            photoUrl: true,
            languages: true,
            levels: true,
            services: {
              select: { id: true, name: true, durationMin: true, priceCents: true, maxPlayers: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── admin: update own club (guarded by ClubMembershipGuard) ──
  async updateClub(clubId: number, input: UpsertClubInput, actorUserId: number) {
    const before = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!before) throw new AppException('not_found');

    // slug uniqueness (excluding self)
    if (input.slug !== before.slug) {
      const clash = await this.prisma.club.findUnique({ where: { slug: input.slug } });
      if (clash) throw new AppException('validation_failed', { fields: { slug: ['taken'] } });
    }

    const club = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        name: input.name,
        slug: input.slug,
        address: input.address,
        cityId: input.cityId,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        timezone: input.timezone,
        currency: input.currency,
        description: input.description ?? null,
        slotIntervalMin: input.slotIntervalMin,
        acceptsMultisport: input.acceptsMultisport ?? false,
      },
      select: PUBLIC_CLUB_SELECT,
    });

    await this.audit(actorUserId, 'club.update', 'Club', clubId, before, club);
    return club;
  }

  /** Update just the club-wide booking granularity (30 or 60 min). */
  async updateSettings(clubId: number, slotIntervalMin: number, actorUserId: number) {
    const before = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!before) throw new AppException('not_found');
    const club = await this.prisma.club.update({
      where: { id: clubId },
      data: { slotIntervalMin },
      select: PUBLIC_CLUB_SELECT,
    });
    await this.audit(actorUserId, 'club.settings', 'Club', clubId, before, club);
    return club;
  }

  /** Clubs the current user administers/staffs (for the admin console). */
  async listMyClubs(userId: number) {
    const memberships = await this.prisma.clubMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { role: true, club: { select: PUBLIC_CLUB_SELECT } },
      orderBy: { clubId: 'asc' },
    });
    return memberships.map((m) => ({ role: m.role, club: m.club }));
  }

  // ── club onboarding (public) — creates CLUB_ADMIN + PENDING club (spec §13) ──
  async joinRequest(input: ClubJoinRequestInput) {
    const email = input.email.toLowerCase();

    const club = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email }, include: { roles: true } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            name: input.ownerName,
            phone: input.phone,
            passwordHash: await hashPassword(input.password),
            locale: 'bg',
            roles: { create: [{ role: Role.CLUB_ADMIN }] },
          },
          include: { roles: true },
        });
      } else if (!user.roles.some((r) => r.role === Role.CLUB_ADMIN)) {
        await tx.userRole.create({ data: { userId: user.id, role: Role.CLUB_ADMIN } });
      }

      const city = await tx.city.upsert({
        where: { name: input.city },
        create: { name: input.city },
        update: {},
      });

      const created = await tx.club.create({
        data: {
          slug: await this.uniqueSlug(tx, input.clubName),
          name: input.clubName,
          address: '—',
          cityId: city.id,
          status: 'PENDING',
          members: { create: [{ userId: user.id, role: Role.CLUB_ADMIN }] },
        },
      });
      return created;
    });

    // notify platform admins (spec §13) — best-effort
    const admins = await this.prisma.user.findMany({
      where: { roles: { some: { role: Role.PLATFORM_ADMIN } } },
      select: { email: true },
    });
    await Promise.all(
      admins.map((a) =>
        this.mail.send({
          to: a.email,
          subject: `New club join request: ${input.clubName}`,
          html: `<p>${input.ownerName} (${email}) requested to add <b>${input.clubName}</b> in ${input.city}.</p>`,
        }),
      ),
    ).catch(() => undefined);

    return { clubId: club.id, status: club.status };
  }

  // ── platform admin: activate / suspend ──
  async setStatus(clubId: number, status: 'ACTIVE' | 'SUSPENDED', actorUserId: number) {
    const before = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!before) throw new AppException('not_found');
    const club = await this.prisma.club.update({
      where: { id: clubId },
      data: { status },
      select: PUBLIC_CLUB_SELECT,
    });
    await this.audit(actorUserId, `club.${status.toLowerCase()}`, 'Club', clubId, before, club);
    return club;
  }

  // ── helpers ──
  private async uniqueSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'club';
    let slug = base;
    let n = 1;
    while (await tx.club.findUnique({ where: { slug } })) {
      slug = `${base}-${++n}`;
    }
    return slug;
  }

  private audit(
    actorUserId: number | null,
    action: string,
    objectType: string,
    objectId: number,
    before: unknown,
    after: unknown,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId,
        action,
        objectType,
        objectId,
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      },
    });
  }
}
