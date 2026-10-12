/**
 * 360 Tennis Club — real club data (non-destructive, safe to re-run).
 *
 * Unlike seed.ts this NEVER wipes anything: every write is an upsert or a
 * skip-if-exists, so it can be pointed at staging/production.
 *
 *   pnpm --filter @playslot/db seed:360
 *
 * What it creates (all copied from the club's Click&Play admin, 7 Oct 2026):
 *  - the club (address, phone, logo, hours 07:00–23:00, 60-min slots, Multisport)
 *  - six clay courts: Централен, Корт 2 … Корт 6 (all lit, open-air; courts 4–6
 *    are under the winter dome and priced higher from 1 Nov to 3 May)
 *  - the price matrix: 3 club-wide base rules (14 / 16 / 16 EUR, all year) plus
 *    9 winter-dome overrides for courts 4–6 (23 / 26 / 26 EUR, 1 Nov – 3 May).
 *    Click&Play needs 9 rows for the same thing. Skipped if the club already has
 *    price rules, unless you set RESET_PRICES=1 (then the club's rules are rebuilt)
 *  - four trainers: Явор, Димитър, Тихомир and Ивайло, each linked to the club
 *    with a shareable COACH resource and availability; Тихомир and Ивайло also
 *    carry the club's own photo and a short bio.
 *  - the club's admin(s), with the CLUB_ADMIN role and membership.
 *
 * NOT created, because the data isn't known yet: trainer services/lesson prices,
 * Явор's photo. The accounts carry no password — give one with
 *   EMAIL=… PASSWORD=… pnpm --filter @playslot/db set:password
 * or let the coach use "forgot password".
 */
import { Prisma, PrismaClient, Role, Sport, Surface } from '@prisma/client';

const prisma = new PrismaClient();

// ── edit these when the real trainer e-mails are known ──
// Photos are the club's own (360tennis.bg); the paths carry Cyrillic, so they
// are stored percent-encoded — a raw Cyrillic URL breaks in some clients.
const PHOTO = 'https://360tennis.bg/wp-content/uploads/2023/08';
// `previousEmail` is the placeholder an account may have been created under
// before the real address was known: the seed moves that account over instead
// of leaving a duplicate behind.
const TRAINERS: {
  email: string;
  name: string;
  previousEmail?: string;
  photoUrl?: string;
  bio?: string;
}[] = [
  {
    email: 'qwor18@gmail.com',
    previousEmail: 'yavor.dimitrov@360tennis.test',
    name: 'Явор Димитров',
  },
  {
    email: 'tisho8888@gmail.com',
    previousEmail: 'tihomir.dimitrov@360tennis.test',
    name: 'Тихомир Димитров',
    photoUrl: `${PHOTO}/4-%D0%A2%D1%80%D0%B5%D0%BD%D0%B5%D1%80-%D0%A2%D0%B8%D1%85%D0%BE%D0%BC%D0%B8%D1%80.jpg`,
    bio: 'Започва да играе тенис на 6 години. Треньор в 360 Тенис клуб от близо две години. Работи предимно с деца — освен техника, държи на дисциплината и спортната култура.',
  },
  { email: 'dimitar.penchev.dr@gmail.com', name: 'Димитър Пенчев' },
  {
    email: 'ivayloik@gmail.com',
    previousEmail: 'ivaylo.koev@360tennis.test',
    name: 'Ивайло Коев',
    photoUrl: `${PHOTO}/1-%D0%A2%D1%80%D0%B5%D0%BD%D0%B5%D1%80-%D0%98%D0%B2%D0%BE.jpg`,
    bio: 'Започва да играе тенис на 5 години. В 360 Тенис клуб е от самото му начало преди около 5 години. Работи както с начинаещи, така и със състезатели — за него тенисът е спорт, който се учи цял живот.',
  },
];

// Club admins: full access to this club's console (calendar, prices, team).
const CLUB_ADMINS = [{ email: 'furnadzhievay@gmail.com', name: 'Дани Фурнаджиева' }];

const OPEN_MIN = 7 * 60; // 07:00
const CLOSE_MIN = 23 * 60; // 23:00
const SPLIT_MIN = 17 * 60; // price changes at 17:00

// weekday bit = 1 << weekday, 0 = Sunday … 6 = Saturday (see packages/domain/src/pricing.ts)
const MON_FRI = 0b0111110;
const SAT_SUN = 0b1000001;

const COURTS = ['Централен', 'Корт 2', 'Корт 3', 'Корт 4', 'Корт 5', 'Корт 6'];
const DOME_COURTS = ['Корт 4', 'Корт 5', 'Корт 6']; // "Балон" in winter

// Winter dome season, Sofia local midnights (DST ends 25 Oct 2026, starts 28 Mar 2027).
// validUntil is exclusive. Add the next winter here each year (or ask for recurring seasons).
const WINTER_2026 = { from: new Date('2026-11-01T00:00:00+02:00'), until: new Date('2027-05-04T00:00:00+03:00') };

/** EUR cents for [weekday 07–17, weekday 17–23, Sat/Sun 07–23]. */
const BASE: [number, number, number] = [1400, 1600, 1600]; // every court, all year
const DOME: [number, number, number] = [2300, 2600, 2600]; // courts 4–6, winter dome

const BANDS = [
  { weekdayMask: MON_FRI, startMin: OPEN_MIN, endMin: SPLIT_MIN },
  { weekdayMask: MON_FRI, startMin: SPLIT_MIN, endMin: CLOSE_MIN },
  { weekdayMask: SAT_SUN, startMin: OPEN_MIN, endMin: CLOSE_MIN },
];

function weekWindows(startMin: number, endMin: number) {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin, endMin }));
}

async function main() {
  // Also renames a city left as "Sofia" by the old free-text entry — the city
  // is identified by its slug, and the display name is the Bulgarian one.
  const sofia = await prisma.city.upsert({
    where: { slug: 'sofia' },
    update: { name: 'София' },
    create: { name: 'София', slug: 'sofia' },
  });

  // ── club ──
  const clubData = {
    name: '360 Тенис клуб',
    address: 'бул. „Цариградско шосе" 31, София',
    cityId: sofia.id,
    currency: 'EUR',
    phone: '0887 90 57 77',
    description:
      '„360" Тенис клуб е наследник на основоположника на тениса в България — Софийски Тенис Клуб, създаден на същото място през 1896 г. Към момента клубът разполага с шест червени (клей) корта с чисто нова настилка, съблекални с възможност за наемане на шкафчета за членове.',
    rules:
      'Клубът работи с карти Мултиспорт, но без детски Мултиспорт. Уважаеми тенисисти, бихме искали да Ви уведомим, че НЕ гарантираме запазен от Вас номер на корт, а само запазен час!',
    // The club's own logo, served from their WordPress site.
    photoUrl: 'https://360tennis.bg/wp-content/uploads/2019/05/logo_360tennisclub_.png',
    slotIntervalMin: 60,
    bookingDurationsMin: [60, 90, 120],
    acceptsMultisport: true,
    paymentMethods: ['ON_SITE' as const, 'MULTISPORT' as const],
    status: 'ACTIVE' as const,
  };
  const club = await prisma.club.upsert({
    where: { slug: '360-tennis-club' },
    update: clubData,
    create: { slug: '360-tennis-club', ...clubData },
  });

  // ── courts ──
  const courtByName = new Map<string, number>();
  for (const name of COURTS) {
    let court = await prisma.resource.findFirst({ where: { clubId: club.id, type: 'COURT', name } });
    if (!court) {
      court = await prisma.resource.create({
        data: {
          clubId: club.id,
          type: 'COURT',
          name,
          sport: Sport.TENNIS,
          surface: Surface.CLAY,
          isIndoor: false,
          hasLighting: true,
          minReservationMin: 60,
          slotIntervalMin: 60,
        },
      });
      await prisma.availabilityRule.createMany({
        data: weekWindows(OPEN_MIN, CLOSE_MIN).map((w) => ({ ...w, resourceId: court!.id })),
      });
    }
    courtByName.set(name, court.id);
  }

  // ── prices ──
  const existingRules = await prisma.priceRule.count({ where: { clubId: club.id } });
  if (existingRules > 0 && process.env.RESET_PRICES !== '1') {
    console.log(`Prices: club already has ${existingRules} rules — left untouched (RESET_PRICES=1 to rebuild).`);
  } else {
    if (existingRules > 0) await prisma.priceRule.deleteMany({ where: { clubId: club.id } });
    const rows: Prisma.PriceRuleCreateManyInput[] = [];
    // Club-wide base prices (no court, no season): the engine falls back to these.
    BANDS.forEach((band, i) =>
      rows.push({ clubId: club.id, ...band, durationMin: 60, priceCents: BASE[i]!, currency: 'EUR', priority: 0 }),
    );
    // Winter dome overrides: a court-specific rule beats a club-wide one at equal priority.
    for (const courtName of DOME_COURTS) {
      BANDS.forEach((band, i) =>
        rows.push({
          clubId: club.id,
          resourceId: courtByName.get(courtName)!,
          ...band,
          validFrom: WINTER_2026.from,
          validUntil: WINTER_2026.until,
          durationMin: 60,
          priceCents: DOME[i]!,
          currency: 'EUR',
          priority: 0,
        }),
      );
    }
    await prisma.priceRule.createMany({ data: rows });
    console.log(`Prices: created ${rows.length} rules.`);
  }

  // ── club admins ──
  for (const a of CLUB_ADMINS) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { name: a.name },
      create: { email: a.email, name: a.name, locale: 'bg' },
    });
    await prisma.userRole.createMany({
      data: [{ userId: user.id, role: Role.CLUB_ADMIN }],
      skipDuplicates: true,
    });
    await prisma.clubMember.createMany({
      data: [{ clubId: club.id, userId: user.id, role: Role.CLUB_ADMIN }],
      skipDuplicates: true,
    });
  }

  // ── trainers ──
  for (const t of TRAINERS) {
    // Move an account created under the old placeholder address, so the coach
    // keeps their id — and with it their lessons, feedback and availability.
    if (t.previousEmail) {
      const previous = await prisma.user.findUnique({ where: { email: t.previousEmail } });
      const current = await prisma.user.findUnique({ where: { email: t.email } });
      if (previous && !current) {
        await prisma.user.update({ where: { id: previous.id }, data: { email: t.email } });
        console.log(`Trainer ${t.name}: ${t.previousEmail} → ${t.email}`);
      }
    }
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { name: t.name },
      create: { email: t.email, name: t.name, locale: 'bg' },
    });
    await prisma.userRole.createMany({ data: [{ userId: user.id, role: Role.COACH }], skipDuplicates: true });
    await prisma.clubMember.createMany({
      data: [{ clubId: club.id, userId: user.id, role: Role.COACH }],
      skipDuplicates: true,
    });
    // Photo and bio are refreshed on every run, but only when this file has
    // them — a coach who has since edited their own profile keeps it.
    const details = {
      ...(t.photoUrl ? { photoUrl: t.photoUrl } : {}),
      ...(t.bio ? { bio: t.bio } : {}),
    };
    const profile = await prisma.coachProfile.upsert({
      where: { userId: user.id },
      update: details,
      create: { userId: user.id, languages: ['bg'], levels: [], worksWith: [], ...details },
    });
    await prisma.coachClub.createMany({
      data: [{ coachProfileId: profile.id, clubId: club.id }],
      skipDuplicates: true,
    });
    let resource = await prisma.resource.findFirst({ where: { type: 'COACH', coachProfileId: profile.id } });
    if (!resource) {
      resource = await prisma.resource.create({
        data: { clubId: null, type: 'COACH', name: t.name, coachProfileId: profile.id, minReservationMin: 60, slotIntervalMin: 60 },
      });
      await prisma.availabilityRule.createMany({
        data: weekWindows(OPEN_MIN, CLOSE_MIN).map((w) => ({ ...w, resourceId: resource!.id })),
      });
    }
  }

  console.log(
    `360 Tennis Club ready (club #${club.id}): ${COURTS.length} courts, ${TRAINERS.length} trainers, ${CLUB_ADMINS.length} admin(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
