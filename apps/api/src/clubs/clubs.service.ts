import { Injectable } from '@nestjs/common';
import {
  type AddMemberInput,
  type ClubClosureDto,
  type ClubJoinRequestInput,
  type CreateClubClosureInput,
  type ClubTeamDto,
  type ClubTeamMemberDto,
  type FeaturedClubDto,
  type InviteResultDto,
  type PlatformClubDto,
  type PlatformCreateClubInput,
  type UpdateClubProfileInput,
  type UpsertClubInput,
} from '@playslot/contracts';
import { type Prisma, Role } from '@playslot/db';
import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import { AppException, Errors } from '../common/app-exception';
import { AuthService } from '../auth/auth.service';
import { AvailabilityService } from '../availability/availability.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/password';

// How many days ahead the homepage "featured club" card will search for the
// club's soonest free slot before giving up (spec: keep this cheap — most
// active clubs have a free slot today or tomorrow).
const FEATURED_SEARCH_DAYS = 7;

/** Add `days` calendar days to a "YYYY-MM-DD" string (UTC-anchored, DST-safe —
 * we only ever use the result as a calendar date, never as an instant). */
function shiftIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

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
  phone: true,
  photoUrl: true,
  rules: true,
  slotIntervalMin: true,
  bookingDurationsMin: true,
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
    private readonly auth: AuthService,
    private readonly availability: AvailabilityService,
  ) {}

  /** Cities that have at least one active club (for the search location filter). */
  listCities() {
    return this.prisma.city.findMany({
      where: { clubs: { some: { status: 'ACTIVE' } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

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
    return { ...club, openingHours: await this.openingHours(club.id) };
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
    // Coaches link to clubs via CoachClub (one shared resource per coach, §10).
    const links = await this.prisma.coachClub.findMany({
      where: { clubId: club.id },
      select: {
        coachProfile: {
          select: {
            id: true,
            bio: true,
            photoUrl: true,
            languages: true,
            levels: true,
            user: { select: { name: true } },
            services: {
              select: { id: true, name: true, durationMin: true, priceCents: true, maxPlayers: true },
            },
          },
        },
      },
    });
    return links
      .map((l) => l.coachProfile)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({
        coachProfileId: c.id,
        name: c.user?.name ?? 'Coach',
        bio: c.bio,
        photoUrl: c.photoUrl,
        languages: c.languages,
        levels: c.levels,
        services: c.services,
      }));
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
        phone: input.phone || null,
        photoUrl: input.photoUrl || null,
        rules: input.rules || null,
        slotIntervalMin: input.slotIntervalMin,
        acceptsMultisport: input.acceptsMultisport ?? false,
      },
      select: PUBLIC_CLUB_SELECT,
    });

    await this.audit(actorUserId, 'club.update', 'Club', clubId, before, club);
    return club;
  }

  /** Club-admin partial update of the public profile (name/slug/city unchanged). */
  async updateClubProfile(clubId: number, input: UpdateClubProfileInput, actorUserId: number) {
    const before = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!before) throw new AppException('not_found');
    const club = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl || null } : {}),
        ...(input.rules !== undefined ? { rules: input.rules || null } : {}),
      },
      select: PUBLIC_CLUB_SELECT,
    });
    await this.audit(actorUserId, 'club.profile_update', 'Club', clubId, before, club);
    return club;
  }

  // ── special days: club closures / downtime (applied to all courts) ──

  async listClosures(clubId: number): Promise<ClubClosureDto[]> {
    const rows = await this.prisma.resourceException.findMany({
      where: { resource: { clubId, type: 'COURT' }, endsAt: { gt: new Date() } },
      select: { startsAt: true, endsAt: true, reason: true },
      orderBy: { startsAt: 'asc' },
    });
    // Identical windows across courts collapse into one closure with a court count.
    const map = new Map<string, ClubClosureDto>();
    for (const r of rows) {
      const key = `${r.startsAt.toISOString()}|${r.endsAt.toISOString()}|${r.reason}`;
      const cur = map.get(key);
      if (cur) cur.courtCount++;
      else map.set(key, { startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), reason: r.reason, courtCount: 1 });
    }
    return [...map.values()];
  }

  async createClosure(clubId: number, input: CreateClubClosureInput, actorUserId: number): Promise<ClubClosureDto> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { timezone: true } });
    if (!club) throw new AppException('not_found');
    const tz = club.timezone;
    const start = input.allDay
      ? instantFromDayMinutes(input.fromDate, 0, tz)
      : instantFromDayMinutes(input.fromDate, input.startMin!, tz);
    const end = input.allDay
      ? instantFromDayMinutes(input.toDate, 24 * 60, tz)
      : instantFromDayMinutes(input.fromDate, input.endMin!, tz);
    if (end <= start) throw new AppException('validation_failed', { fields: { toDate: ['must be after start'] } });

    const courts = await this.prisma.resource.findMany({
      where: { clubId, type: 'COURT', status: 'ACTIVE' },
      select: { id: true },
    });
    if (courts.length === 0) throw new AppException('policy_violation', { reason: 'no_courts' });
    await this.prisma.resourceException.createMany({
      data: courts.map((c) => ({ resourceId: c.id, startsAt: start, endsAt: end, reason: input.reason })),
    });
    await this.audit(actorUserId, 'club.closure_created', 'Club', clubId, null, { start, end, reason: input.reason, courts: courts.length });
    return { startsAt: start.toISOString(), endsAt: end.toISOString(), reason: input.reason, courtCount: courts.length };
  }

  async deleteClosure(clubId: number, startsAt: string, endsAt: string, actorUserId: number): Promise<{ deleted: number }> {
    const res = await this.prisma.resourceException.deleteMany({
      where: { resource: { clubId, type: 'COURT' }, startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
    });
    await this.audit(actorUserId, 'club.closure_deleted', 'Club', clubId, { startsAt, endsAt }, null);
    return { deleted: res.count };
  }

  /** Derived club opening hours: earliest open / latest close across active courts, per weekday. */
  async openingHours(clubId: number): Promise<{ weekday: number; startMin: number; endMin: number }[]> {
    const rules = await this.prisma.availabilityRule.findMany({
      where: { resource: { clubId, type: 'COURT', status: 'ACTIVE' } },
      select: { weekday: true, startMin: true, endMin: true },
    });
    const byDay = new Map<number, { startMin: number; endMin: number }>();
    for (const r of rules) {
      const cur = byDay.get(r.weekday);
      byDay.set(r.weekday, {
        startMin: cur ? Math.min(cur.startMin, r.startMin) : r.startMin,
        endMin: cur ? Math.max(cur.endMin, r.endMin) : r.endMin,
      });
    }
    return [...byDay.entries()]
      .map(([weekday, h]) => ({ weekday, ...h }))
      .sort((a, b) => a.weekday - b.weekday);
  }

  /**
   * Update the club's scheduling settings: the booking granularity (30 or 60
   * min) and the booking lengths it offers players. Durations must be whole
   * multiples of the granularity — otherwise a player could be shown a length
   * that can never line up with a real slot.
   */
  async updateSettings(
    clubId: number,
    input: { slotIntervalMin: number; bookingDurationsMin?: number[] },
    actorUserId: number,
  ) {
    const before = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!before) throw new AppException('not_found');

    let bookingDurationsMin: number[] | undefined;
    if (input.bookingDurationsMin) {
      const cleaned = [...new Set(input.bookingDurationsMin)].sort((a, b) => a - b);
      if (cleaned.some((d) => d % input.slotIntervalMin !== 0)) {
        throw Errors.validation({ bookingDurationsMin: input.bookingDurationsMin });
      }
      bookingDurationsMin = cleaned;
    }

    const club = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        slotIntervalMin: input.slotIntervalMin,
        ...(bookingDurationsMin ? { bookingDurationsMin } : {}),
      },
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

  // ── platform admin: full club roster + direct creation (spec §13) ──
  async listAllClubs(): Promise<PlatformClubDto[]> {
    const clubs = await this.prisma.club.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        isFeatured: true,
        city: { select: { name: true } },
        members: { where: { role: Role.CLUB_ADMIN, status: 'ACTIVE' }, select: { id: true } },
      },
    });
    const coachCounts = await this.prisma.coachClub.groupBy({ by: ['clubId'], _count: { _all: true } });
    const coachMap = new Map(coachCounts.map((c) => [c.clubId, c._count._all]));
    return clubs.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city.name,
      status: c.status,
      adminCount: c.members.length,
      coachCount: coachMap.get(c.id) ?? 0,
      isFeatured: c.isFeatured,
    }));
  }

  /**
   * Platform admin picks (or clears) the one club that headlines the homepage
   * hero card. Featuring a club un-features whatever was featured before —
   * exactly one club (or none) can be featured at a time.
   */
  async setFeatured(clubId: number, featured: boolean, actorUserId: number): Promise<{ isFeatured: boolean }> {
    const before = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!before) throw new AppException('not_found');

    await this.prisma.$transaction(async (tx) => {
      if (featured) {
        await tx.club.updateMany({ where: { isFeatured: true, id: { not: clubId } }, data: { isFeatured: false } });
      }
      await tx.club.update({ where: { id: clubId }, data: { isFeatured: featured } });
    });

    await this.audit(actorUserId, featured ? 'club.featured' : 'club.unfeatured', 'Club', clubId, before, { isFeatured: featured });
    return { isFeatured: featured };
  }

  /**
   * Public: the featured club's soonest free slot, for the homepage hero card.
   * Returns null when no club is featured, the featured club isn't ACTIVE, or
   * it has no free slot within the search window — the homepage falls back to
   * its illustrative placeholder in any of those cases.
   */
  async getFeaturedForHome(): Promise<FeaturedClubDto | null> {
    const club = await this.prisma.club.findFirst({
      where: { isFeatured: true, status: 'ACTIVE' },
      select: { id: true, slug: true, name: true, address: true, timezone: true, city: { select: { name: true } } },
    });
    if (!club) return null;

    const today = formatInZone(new Date(), club.timezone, 'yyyy-MM-dd');
    for (let i = 0; i < FEATURED_SEARCH_DAYS; i++) {
      const date = shiftIsoDate(today, i);
      const day = await this.availability.getAvailability({ clubId: club.id, date });
      const free = day.slots.filter((s) => s.state === 'FREE').sort((a, b) => a.start.localeCompare(b.start));
      if (free.length === 0) continue;
      const slot = free[0]!;
      const court = day.courts.find((c) => c.id === slot.resourceId);
      return {
        club: { id: club.id, slug: club.slug, name: club.name, address: club.address, city: club.city.name },
        slot: {
          date,
          start: slot.start,
          end: slot.end,
          priceCents: slot.priceCents,
          currency: day.currency,
          courtName: court?.name ?? '',
          hasCoach: slot.coachIds.length > 0,
        },
      };
    }
    return null;
  }

  /** Full club record for a platform admin to manage (any status). */
  async getForAdmin(clubId: number) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: PUBLIC_CLUB_SELECT });
    if (!club) throw new AppException('not_found');
    return { ...club, openingHours: await this.openingHours(clubId) };
  }

  async createClubAsPlatform(input: PlatformCreateClubInput, actorUserId: number): Promise<PlatformClubDto> {
    const club = await this.prisma.$transaction(async (tx) => {
      const city = await tx.city.upsert({ where: { name: input.city }, create: { name: input.city }, update: {} });
      return tx.club.create({
        data: {
          slug: await this.uniqueSlug(tx, input.name),
          name: input.name,
          address: input.address ?? '—',
          cityId: city.id,
          status: 'ACTIVE',
          timezone: input.timezone,
          currency: input.currency,
          slotIntervalMin: input.slotIntervalMin,
        },
        select: { id: true, slug: true, name: true, status: true, city: { select: { name: true } } },
      });
    });
    await this.audit(actorUserId, 'club.created', 'Club', club.id, null, club);
    return {
      id: club.id,
      slug: club.slug,
      name: club.name,
      city: club.city.name,
      status: club.status,
      adminCount: 0,
      coachCount: 0,
      isFeatured: false,
    };
  }

  async addClubAdmin(clubId: number, input: AddMemberInput, actorUserId: number): Promise<InviteResultDto> {
    const club = await this.requireClub(clubId);
    const { userId, name, created } = await this.ensureUser(input, Role.CLUB_ADMIN);
    await this.prisma.clubMember.upsert({
      where: { clubId_userId_role: { clubId, userId, role: Role.CLUB_ADMIN } },
      create: { clubId, userId, role: Role.CLUB_ADMIN, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await this.audit(actorUserId, 'club.admin_added', 'Club', clubId, null, { userId });
    return this.inviteResult(userId, input.email, name, 'CLUB_ADMIN', created, club.name);
  }

  // ── club admin: team (coaches + staff) ──
  async getTeam(clubId: number): Promise<ClubTeamDto> {
    const members = await this.prisma.clubMember.findMany({
      where: { clubId, status: 'ACTIVE', role: { in: [Role.CLUB_ADMIN, Role.CLUB_STAFF] } },
      select: { role: true, user: { select: { id: true, name: true, email: true, passwordHash: true } } },
    });
    const coaches = await this.prisma.coachClub.findMany({
      where: { clubId },
      select: { coachProfile: { select: { id: true, user: { select: { id: true, name: true, email: true, passwordHash: true } } } } },
    });
    const toMember = (
      u: { id: number; name: string; email: string; passwordHash: string | null },
      role: ClubTeamMemberDto['role'],
      coachProfileId?: number,
    ): ClubTeamMemberDto => ({ userId: u.id, coachProfileId, name: u.name, email: u.email, role, pending: u.passwordHash == null });
    return {
      admins: members.filter((m) => m.role === Role.CLUB_ADMIN).map((m) => toMember(m.user, 'CLUB_ADMIN')),
      staff: members.filter((m) => m.role === Role.CLUB_STAFF).map((m) => toMember(m.user, 'CLUB_STAFF')),
      coaches: coaches
        .filter((c) => c.coachProfile.user)
        .map((c) => toMember(c.coachProfile.user!, 'COACH', c.coachProfile.id)),
    };
  }

  async addStaff(clubId: number, input: AddMemberInput, actorUserId: number): Promise<InviteResultDto> {
    const club = await this.requireClub(clubId);
    const { userId, name, created } = await this.ensureUser(input, Role.CLUB_STAFF);
    await this.prisma.clubMember.upsert({
      where: { clubId_userId_role: { clubId, userId, role: Role.CLUB_STAFF } },
      create: { clubId, userId, role: Role.CLUB_STAFF, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await this.audit(actorUserId, 'club.staff_added', 'Club', clubId, null, { userId });
    return this.inviteResult(userId, input.email, name, 'CLUB_STAFF', created, club.name);
  }

  async addCoach(clubId: number, input: AddMemberInput, actorUserId: number): Promise<InviteResultDto> {
    const club = await this.requireClub(clubId);
    const { userId, name, created } = await this.ensureUser(input, Role.COACH);

    let profile = await this.prisma.coachProfile.findFirst({ where: { userId }, select: { id: true } });
    if (!profile) {
      profile = await this.prisma.coachProfile.create({ data: { userId, languages: [], levels: [] }, select: { id: true } });
    }
    const link = await this.prisma.coachClub.findFirst({ where: { coachProfileId: profile.id, clubId } });
    if (!link) await this.prisma.coachClub.create({ data: { coachProfileId: profile.id, clubId } });

    // One shared COACH resource per coach, with sensible default hours (Mon–Fri 09–21).
    const resource = await this.prisma.resource.findFirst({ where: { coachProfileId: profile.id, type: 'COACH' }, select: { id: true } });
    if (!resource) {
      await this.prisma.resource.create({
        data: {
          clubId: null,
          type: 'COACH',
          name,
          coachProfileId: profile.id,
          minReservationMin: 60,
          slotIntervalMin: 60,
          availabilityRules: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 540, endMin: 1260 })) },
        },
      });
    }
    await this.audit(actorUserId, 'club.coach_added', 'Club', clubId, null, { coachProfileId: profile.id, userId });
    return this.inviteResult(userId, input.email, name, 'COACH', created, club.name);
  }

  private async requireClub(clubId: number): Promise<{ name: string }> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { name: true } });
    if (!club) throw new AppException('not_found');
    return club;
  }

  /** Find a user by email (adding the role if missing) or create an unactivated one. */
  private async ensureUser(input: AddMemberInput, role: Role): Promise<{ userId: number; name: string; created: boolean }> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, include: { roles: true } });
    if (existing) {
      if (!existing.roles.some((r) => r.role === role)) {
        await this.prisma.userRole.create({ data: { userId: existing.id, role } });
      }
      return { userId: existing.id, name: existing.name, created: false };
    }
    const name = input.name ?? email.split('@')[0]!;
    const created = await this.prisma.user.create({ data: { email, name, locale: 'bg', roles: { create: [{ role }] } } });
    return { userId: created.id, name, created: true };
  }

  /** New accounts get an invite (set-password) link + email; existing users are just linked. */
  private async inviteResult(
    userId: number,
    email: string,
    name: string,
    role: string,
    created: boolean,
    clubName: string,
  ): Promise<InviteResultDto> {
    if (!created) return { email, name, role, invited: false };
    const link = await this.auth.createInviteLink(userId, 'bg');
    await this.mail.sendAccountInvite(email, link, { clubName, role }, 'bg').catch(() => undefined);
    return { email, name, role, invited: true, inviteLink: link };
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
