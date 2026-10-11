// Fails when an API enum value has no bg/en label (QA-16). Enum codes such as
// TENNIS or ACTIVE must never reach the screen, so adding a value to
// @playslot/contracts without translating it is a build error, not a surprise
// in production.
//
// Run: node scripts/check-enum-labels.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(here, '..', p), 'utf8'));
const messages = { bg: read('messages/bg.json'), en: read('messages/en.json') };

// Read the enum values straight from the contracts source, so this script has
// no build step and can run before anything is compiled.
const contracts = readFileSync(join(here, '../../../packages/contracts/src/enums.ts'), 'utf8');
const schemas = readFileSync(join(here, '../../../packages/contracts/src/schemas.ts'), 'utf8');

const listOf = (source, name) => {
  const m = source.match(new RegExp(`${name}\\s*=\\s*(?:z\\.enum\\()?\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`could not find ${name} in the contracts source`);
  return [...m[1].matchAll(/'([A-Z_a-z]+)'/g)].map((x) => x[1]);
};

const EXPECTED = {
  Sport: listOf(contracts, 'SPORTS'),
  Role: listOf(contracts, 'ROLES'),
  Surface: listOf(schemas, 'surfaceEnum'),
  // Not enumerated in contracts: kept here deliberately, with the same guard.
  ClubStatus: ['PENDING', 'ACTIVE', 'SUSPENDED'],
  ReservationType: ['COURT', 'LESSON', 'EVENT', 'TOURNAMENT', 'BLOCK', 'MAINTENANCE', 'GROUP'],
  Language: ['bg', 'en'],
};

// Validation codes travel from the API as codes; each needs bg + en wording.
const FIELD_ERROR_CODES = listOf(
  readFileSync(join(here, '../../../packages/contracts/src/schemas.ts'), 'utf8'),
  'FIELD_ERROR_CODES',
);

const missing = [];
for (const [locale, catalog] of Object.entries(messages)) {
  for (const code of [...FIELD_ERROR_CODES, 'invalid']) {
    if (!catalog.FieldErrors?.[code]) missing.push(`${locale}: FieldErrors.${code}`);
  }
}

for (const [locale, catalog] of Object.entries(messages)) {
  for (const [kind, values] of Object.entries(EXPECTED)) {
    for (const value of values) {
      if (!catalog.Enums?.[kind]?.[value]) missing.push(`${locale}: Enums.${kind}.${value}`);
    }
  }
}

if (missing.length > 0) {
  console.error(`Missing enum labels (${missing.length}):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const count = Object.values(EXPECTED).reduce((n, v) => n + v.length, 0);
console.log(
  `All ${count} enum values and ${FIELD_ERROR_CODES.length} validation codes have bg and en labels.`,
);
