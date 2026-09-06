/**
 * Database backup (spec §24). Writes a compressed custom-format pg_dump to
 * ./backups/playslot-<timestamp>.dump using DATABASE_URL. Requires pg_dump on PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const dir = resolve(process.cwd(), 'backups');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = resolve(dir, `playslot-${stamp}.dump`);

try {
  execFileSync('pg_dump', ['--format=custom', '--no-owner', '--file', out, url], {
    stdio: 'inherit',
  });
  console.log(`Backup written: ${out}`);
} catch (e) {
  console.error('pg_dump failed. Is PostgreSQL client installed and DATABASE_URL reachable?', e);
  process.exit(1);
}
