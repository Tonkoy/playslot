/**
 * Give an existing account a password — safe to run against production.
 *
 *   EMAIL=someone@example.com PASSWORD='…' pnpm --filter @playslot/db set:password
 *
 * Used for accounts the seeds create without one (the 360 trainers, staff
 * invited by an admin) so they can sign in before transactional email is fully
 * set up. It also marks the address as verified, because an address we typed in
 * ourselves has no verification link to follow.
 *
 * The script never creates an account: a typo must fail loudly rather than
 * leave a stray user behind. VERIFY=0 skips marking the address verified.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMAIL = (process.env.EMAIL ?? '').trim().toLowerCase();
const PASSWORD = process.env.PASSWORD ?? '';

async function main() {
  if (!EMAIL) throw new Error('EMAIL is required.');
  if (PASSWORD.length < 12) throw new Error('PASSWORD must be at least 12 characters.');

  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, name: true, emailVerifiedAt: true, roles: { select: { role: true } } },
  });
  if (!user) throw new Error(`No account with e-mail ${EMAIL}. Check the spelling, or seed it first.`);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hash(PASSWORD),
      ...(process.env.VERIFY === '0' || user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
    },
  });

  const roles = user.roles.map((r) => r.role).join(', ') || 'no roles';
  console.log(`Password set for ${user.name} <${EMAIL}> (${roles}).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
