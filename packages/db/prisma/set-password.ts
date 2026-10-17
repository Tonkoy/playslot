/**
 * Give existing accounts a password — safe to run against production.
 *
 *   EMAILS=a@x.com,b@y.com PASSWORD='…' pnpm --filter @playslot/db set:password
 *   EMAILS=a@x.com,b@y.com pnpm --filter @playslot/db set:password   # generated
 *
 * Used for accounts the seeds create without one (the 360 trainers and the
 * club's admin) so they can sign in before transactional email is fully set up.
 * It also marks each address as verified, because an address typed in by hand
 * has no verification link to follow (VERIFY=0 skips that).
 *
 * With no PASSWORD a strong one is generated per account and printed once —
 * nothing stores it in clear anywhere, so copy it from the output and hand it
 * over through something other than e-mail.
 *
 * The script never creates an account: a typo must fail loudly rather than
 * leave a stray user behind.
 */
import { randomInt } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMAILS = (process.env.EMAILS ?? process.env.EMAIL ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const PASSWORD = process.env.PASSWORD ?? null;

// Ambiguous characters (0/O, 1/l/I) left out: these get read off a screen and
// typed by hand. The shape matches the app's rule: lower + upper + digit.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const ALL = LOWER + UPPER + DIGIT;

function generatePassword(length = 16): string {
  const pick = (set: string) => set[randomInt(set.length)]!;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher-Yates, so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

async function main() {
  if (EMAILS.length === 0) throw new Error('EMAIL or EMAILS is required.');
  // The same rule the app enforces on registration (packages/contracts,
  // `password`): 8+ characters with a lower-case letter, an upper-case letter
  // and a digit. Anything the app would reject must be rejected here too —
  // otherwise the person can sign in but cannot change their password.
  if (PASSWORD !== null) {
    const problems = [
      PASSWORD.length < 8 && 'at least 8 characters',
      !/[a-z]/.test(PASSWORD) && 'a lower-case letter',
      !/[A-Z]/.test(PASSWORD) && 'an upper-case letter',
      !/[0-9]/.test(PASSWORD) && 'a digit',
    ].filter(Boolean);
    if (problems.length) throw new Error(`PASSWORD needs ${problems.join(', ')}.`);
  }

  // Resolve everyone first: one unknown address stops the run before any write,
  // so a typo can't leave half the team changed.
  const users = [];
  for (const email of EMAILS) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, emailVerifiedAt: true, roles: { select: { role: true } } },
    });
    if (!user) throw new Error(`No account with e-mail ${email}. Check the spelling, or seed it first.`);
    users.push({ email, ...user });
  }

  const issued: { email: string; password: string | null; roles: string }[] = [];
  for (const user of users) {
    const password = PASSWORD ?? generatePassword();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(password),
        ...(process.env.VERIFY === '0' || user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
      },
    });
    issued.push({
      email: user.email,
      password: PASSWORD ? null : password,
      roles: user.roles.map((r) => r.role).join(', ') || 'no roles',
    });
  }

  for (const row of issued) {
    console.log(`${row.email}  ${row.password ?? '(the password you supplied)'}  [${row.roles}]`);
  }
  if (issued.some((r) => r.password)) {
    console.log('\nPasswords are shown once. Send them over something other than e-mail,');
    console.log('and ask each person to change theirs in Профил → Настройки.');
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
