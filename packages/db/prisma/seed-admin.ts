/**
 * Platform owner account — safe to re-run, safe against production.
 *
 *   ADMIN_PASSWORD='…' pnpm --filter @playslot/db seed:admin
 *
 * Creates (or updates) one identity and makes it:
 *  - PLATFORM_ADMIN — sees every club, user and booking in the platform console;
 *  - CLUB_ADMIN of every ACTIVE club — so the club consoles are reachable too,
 *    including clubs added later (re-run this script after adding one).
 *
 * The password never lives in the repo: it comes from ADMIN_PASSWORD, and is
 * stored only as an argon2 hash. Without ADMIN_PASSWORD an existing account
 * keeps its current password and a new one is created without one — sign in
 * with "forgot password" in that case.
 *
 * ADMIN_EMAIL overrides the address; the default is the platform's own.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@playslot.bg').toLowerCase();
const NAME = process.env.ADMIN_NAME ?? 'PlaySlot admin';
const PASSWORD = process.env.ADMIN_PASSWORD ?? null;

async function main() {
  if (PASSWORD !== null && PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }
  const passwordHash = PASSWORD ? await hash(PASSWORD) : undefined;

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    // An existing account keeps its name and password unless this run sets one.
    update: {
      emailVerifiedAt: new Date(),
      ...(passwordHash ? { passwordHash } : {}),
    },
    create: {
      email: EMAIL,
      name: NAME,
      locale: 'bg',
      emailVerifiedAt: new Date(),
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  await prisma.userRole.createMany({
    data: [{ userId: user.id, role: Role.PLATFORM_ADMIN }],
    skipDuplicates: true,
  });

  const clubs = await prisma.club.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } });
  await prisma.clubMember.createMany({
    data: clubs.map((c) => ({ clubId: c.id, userId: user.id, role: Role.CLUB_ADMIN })),
    skipDuplicates: true,
  });

  console.log(`${EMAIL} is PLATFORM_ADMIN and CLUB_ADMIN of ${clubs.length} club(s): ${clubs.map((c) => c.name).join(', ')}`);
  console.log(passwordHash ? 'Password set from ADMIN_PASSWORD.' : 'No ADMIN_PASSWORD given — use "forgot password" to set one.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
