/**
 * Database restore (spec §24). Restores a pg_dump custom-format file into the
 * DATABASE_URL target. DANGER: --clean drops existing objects first, so point
 * DATABASE_URL at a scratch/restore database, never production, when testing.
 *
 * Usage: DATABASE_URL=… pnpm --filter @playslot/db db:restore <file.dump>
 */
import { execFileSync } from 'node:child_process';

const url = process.env.DATABASE_URL;
const file = process.argv[2];
if (!url || !file) {
  console.error('Usage: DATABASE_URL=… db:restore <file.dump>');
  process.exit(1);
}

try {
  execFileSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', url, file], {
    stdio: 'inherit',
  });
  console.log(`Restored ${file}`);
} catch (e) {
  console.error('pg_restore failed.', e);
  process.exit(1);
}
