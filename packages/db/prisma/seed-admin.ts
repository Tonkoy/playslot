/**
 * Platform owner account — safe to re-run, safe against production.
 *
 *   ADMIN_PASSWORD='…' pnpm --filter @playslot/db seed:admin
 *
 * Creates (or updates) one identity and makes it PLATFORM_ADMIN: it sees and
 * manages every club, user and booking. It is not made a member of any club —
 * the platform admin needs none, and each club has its own single club admin —
 * and it is not a player (the PLAYER role is taken away).
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
  // Not a player, and not a club's admin (a club has one, named in the platform console).
  await prisma.userRole.deleteMany({ where: { userId: user.id, role: { in: [Role.PLAYER, Role.CLUB_ADMIN] } } });
  await prisma.clubMember.deleteMany({ where: { userId: user.id, role: Role.CLUB_ADMIN } });

  console.log(`${EMAIL} is PLATFORM_ADMIN.`);
  console.log(passwordHash ? 'Password set from ADMIN_PASSWORD.' : 'No ADMIN_PASSWORD given — use "forgot password" to set one.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
