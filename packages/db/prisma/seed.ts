/**
 * Deterministic dev/demo seed (spec §23).
 *
 * Covers the inventory + accounts foundation: cities, two active clubs, mixed
 * courts, availability rules, peak/off-peak pricing, three coaches with distinct
 * services, memberships across roles, and cancellation policies (spec §12).
 *
 * Reservation/block rows and the "coach free but no court / vice-versa" scenario
 * are added in the Phase 3 seed, once the booking transaction + EXCLUDE
 * constraint exist (a ReservationResource carries a tstzrange period that must be
 * written through the booking path, not hand-rolled here).
 *
 * Idempotent: wipes the seeded tables in FK-safe order, then recreates.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient, Role, Sport, Surface } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';

// Weekday range helper: Mon–Sun, one availability window per day.
function weekWindows(startMin: number, endMin: number) {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin, endMin }));
}

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD);

  // ── wipe (dev only), children before parents ──
  await prisma.$transaction([
    prisma.reservationResource.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.priceRule.deleteMany(),
    prisma.availabilityRule.deleteMany(),
    prisma.resourceException.deleteMany(),
    prisma.coachService.deleteMany(),
    prisma.coachClub.deleteMany(),
    prisma.resource.deleteMany(),
    prisma.cancellationPolicy.deleteMany(),
    prisma.clubMember.deleteMany(),
    prisma.coachProfile.deleteMany(),
    prisma.playerProfile.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.club.deleteMany(),
    prisma.city.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ── city ──
  const sofia = await prisma.city.create({ data: { name: 'Sofia' } });

  // ── users (one identity, many roles — golden rule §2.8) ──
  async function createUser(opts: {
    email: string;
    name: string;
    roles: Role[];
    verified?: boolean;
    isVisible?: boolean;
  }) {
    return prisma.user.create({
      data: {
        email: opts.email,
        name: opts.name,
        passwordHash,
        emailVerifiedAt: opts.verified ? new Date() : null,
        isVisible: opts.isVisible ?? false,
        locale: 'bg',
        roles: { create: opts.roles.map((role) => ({ role })) },
      },
    });
  }

  const platformAdmin = await createUser({
    email: 'platform@playslot.test',
    name: 'Платформен админ',
    roles: [Role.PLATFORM_ADMIN],
    verified: true,
  });

  const admin = await createUser({
    email: 'admin@playslot.test',
    name: 'Клубен администратор',
    roles: [Role.CLUB_ADMIN],
    verified: true,
  });

  const staff = await createUser({
    email: 'staff@playslot.test',
    name: 'Рецепция',
    roles: [Role.CLUB_STAFF],
    verified: true,
  });

  const player = await createUser({
    email: 'player@playslot.test',
    name: 'Иван Играч',
    roles: [Role.PLAYER],
    verified: true,
    isVisible: true,
  });
  await prisma.playerProfile.create({
    data: { userId: player.id, level: 'intermediate', hand: 'right', city: 'Sofia' },
  });

  const coachUsers = await Promise.all(
    [
      { email: 'coach1@playslot.test', name: 'Мария Треньор' },
      { email: 'coach2@playslot.test', name: 'Георги Треньор' },
      { email: 'coach3@playslot.test', name: 'Елена Треньор' },
    ].map((c) => createUser({ email: c.email, name: c.name, roles: [Role.COACH], verified: true })),
  );

  // ── clubs (two, both active) ──
  const clubA = await prisma.club.create({
    data: {
      slug: 'ace-tennis-center',
      name: 'Ace Tennis Center',
      address: 'бул. Витоша 1, София',
      cityId: sofia.id,
      lat: 42.6939,
      lng: 23.3219,
      currency: 'EUR',
      acceptsMultisport: true,
      status: 'ACTIVE',
      paymentMethods: ['ON_SITE', 'ONLINE', 'MULTISPORT'],
      description: 'Клуб с клей и клей кортове в центъра на София.',
    },
  });

  const clubB = await prisma.club.create({
    data: {
      slug: 'baseline-club',
      name: 'Baseline Club',
      address: 'ул. Драган Цанков 5, София',
      cityId: sofia.id,
      lat: 42.6712,
      lng: 23.3502,
      currency: 'EUR',
      status: 'ACTIVE',
      paymentMethods: ['ON_SITE', 'ONLINE'],
      description: 'Модерен клуб с покрити кортове.',
    },
  });

  // ── memberships ──
  await prisma.clubMember.createMany({
    data: [
      { clubId: clubA.id, userId: admin.id, role: Role.CLUB_ADMIN },
      { clubId: clubA.id, userId: staff.id, role: Role.CLUB_STAFF },
      { clubId: clubA.id, userId: coachUsers[0]!.id, role: Role.COACH },
      { clubId: clubA.id, userId: coachUsers[1]!.id, role: Role.COACH },
      { clubId: clubB.id, userId: coachUsers[2]!.id, role: Role.COACH },
      // coach1 also works at club B → cross-club coach (no double-booking, §8)
      { clubId: clubB.id, userId: coachUsers[0]!.id, role: Role.COACH },
    ],
  });

  // ── courts (≥4, mixed surface/indoor) ──
  async function createCourt(opts: {
    clubId: number;
    name: string;
    surface: Surface;
    isIndoor: boolean;
    hasLighting: boolean;
  }) {
    const court = await prisma.resource.create({
      data: {
        clubId: opts.clubId,
        type: 'COURT',
        name: opts.name,
        sport: Sport.TENNIS,
        surface: opts.surface,
        isIndoor: opts.isIndoor,
        hasLighting: opts.hasLighting,
        minReservationMin: 60,
        slotIntervalMin: 30,
        allowHalfHour: true,
      },
    });
    await prisma.availabilityRule.createMany({
      data: weekWindows(420, 1320).map((w) => ({ ...w, resourceId: court.id })), // 07:00–22:00
    });
    return court;
  }

  const courts = [
    await createCourt({
      clubId: clubA.id,
      name: 'Централен',
      surface: Surface.CLAY,
      isIndoor: false,
      hasLighting: true,
    }),
    await createCourt({
      clubId: clubA.id,
      name: 'Корт 2',
      surface: Surface.HARD,
      isIndoor: true,
      hasLighting: true,
    }),
    await createCourt({
      clubId: clubB.id,
      name: 'North',
      surface: Surface.CLAY,
      isIndoor: false,
      hasLighting: false,
    }),
    await createCourt({
      clubId: clubB.id,
      name: 'South',
      surface: Surface.HARD,
      isIndoor: true,
      hasLighting: true,
    }),
  ];

  // ── pricing: club-wide default (off-peak) + weekday-evening peak (spec §9) ──
  const ALL_WEEKDAYS_MASK = 0b1111111; // 127
  for (const club of [clubA, clubB]) {
    await prisma.priceRule.create({
      data: {
        clubId: club.id,
        priceCents: 3000, // €30/h off-peak, club default
        currency: 'EUR',
        durationMin: 60,
        priority: 0,
      },
    });
    await prisma.priceRule.create({
      data: {
        clubId: club.id,
        priceCents: 4200, // €42/h weekday-evening peak
        currency: 'EUR',
        weekdayMask: 0b0111110, // Mon–Fri
        startMin: 1020, // 17:00
        endMin: 1320, // 22:00
        durationMin: 60,
        priority: 10,
      },
    });
  }
  void ALL_WEEKDAYS_MASK;

  // ── coaches: profiles, services, per-club coach resources + availability ──
  const coachProfiles = await Promise.all(
    coachUsers.map((u, i) =>
      prisma.coachProfile.create({
        data: {
          userId: u.id,
          bio: `Опитен треньор по тенис (#${i + 1}).`,
          languages: ['bg', 'en'],
          levels: ['beginner', 'intermediate', 'advanced'],
        },
      }),
    ),
  );

  // service catalogs differ per coach (spec §23: different services/availability)
  const serviceSpecs = [
    { name: 'Индивидуален урок', durationMin: 60, minPlayers: 1, maxPlayers: 1, priceCents: 5000 },
    { name: 'Урок за двама', durationMin: 60, minPlayers: 2, maxPlayers: 2, priceCents: 7000 },
    { name: 'Групов урок', durationMin: 90, minPlayers: 2, maxPlayers: 4, priceCents: 9000 },
  ];
  for (let i = 0; i < coachProfiles.length; i++) {
    await prisma.coachService.create({
      data: { coachProfileId: coachProfiles[i]!.id, courtRequired: true, ...serviceSpecs[i]! },
    });
  }

  // coach→club links + a COACH resource per (coach, club) with availability
  async function linkCoachToClub(coachProfileId: number, clubId: number, name: string) {
    await prisma.coachClub.create({ data: { coachProfileId, clubId } });
    const res = await prisma.resource.create({
      data: { clubId, type: 'COACH', name, coachProfileId, minReservationMin: 60, slotIntervalMin: 30 },
    });
    await prisma.availabilityRule.createMany({
      data: weekWindows(540, 1260).map((w) => ({ ...w, resourceId: res.id })), // 09:00–21:00
    });
  }
  await linkCoachToClub(coachProfiles[0]!.id, clubA.id, 'Мария Треньор');
  await linkCoachToClub(coachProfiles[0]!.id, clubB.id, 'Мария Треньор'); // cross-club
  await linkCoachToClub(coachProfiles[1]!.id, clubA.id, 'Георги Треньор');
  await linkCoachToClub(coachProfiles[2]!.id, clubB.id, 'Елена Треньор');

  // ── cancellation policies (spec §12) ──
  for (const club of [clubA, clubB]) {
    await prisma.cancellationPolicy.create({
      data: {
        clubId: club.id,
        appliesTo: 'COURT',
        tiers: [
          { minHoursBefore: 24, refundPercent: 100 },
          { minHoursBefore: 12, refundPercent: 50 },
          { minHoursBefore: 0, refundPercent: 0 },
        ],
      },
    });
    await prisma.cancellationPolicy.create({
      data: {
        clubId: club.id,
        appliesTo: 'LESSON',
        tiers: [
          { minHoursBefore: 24, refundPercent: 100 },
          { minHoursBefore: 0, refundPercent: 0 },
        ],
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seed complete: 1 city, 2 clubs, ${courts.length} courts, ${coachProfiles.length} coaches, ` +
      `${coachUsers.length + 4} users. Demo password for all accounts: ${DEMO_PASSWORD}`,
  );
  void platformAdmin;
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
