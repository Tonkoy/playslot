-- QA-02: cities were created from free text, so "София" and "Sofia" became two
-- rows and the default location found neither's clubs. A city is now identified
-- by a transliterated slug; duplicates are merged into the Bulgarian-named row.
-- citySlug() in @playslot/domain is the reference implementation (unit-tested);
-- this backfill mirrors it for the rows that already exist.

ALTER TABLE "City" ADD COLUMN IF NOT EXISTS "slug" TEXT;

UPDATE "City" SET "slug" = trim(both '-' from regexp_replace(
  translate(
    replace(replace(replace(replace(replace(replace(replace(
      -- word-final "-ия" is "-ia": "София" → sofia, matching the Latin spelling
      regexp_replace(lower("name"), 'ия($|[^а-я])', 'ia\1', 'g'),
      'щ', 'sht'),
      'ж', 'zh'),
      'ч', 'ch'),
      'ш', 'sh'),
      'ц', 'ts'),
      'ю', 'yu'),
      'я', 'ya'),
    'абвгдезийклмнопрстуфхъь',
    'abvgdeziyklmnoprstufhay'
  ),
  '[^a-z0-9]+', '-', 'g'
))
WHERE "slug" IS NULL;

-- Merge duplicates: keep the row written in Cyrillic (the display language),
-- falling back to the lowest id, and repoint the twins' clubs to it.
WITH ranked AS (
  SELECT id, slug,
         first_value(id) OVER (
           PARTITION BY slug
           ORDER BY ("name" ~ '[^\x00-\x7F]') DESC, id ASC
         ) AS keep_id
  FROM "City"
)
UPDATE "Club" c
SET "cityId" = r.keep_id
FROM ranked r
WHERE c."cityId" = r.id AND r.id <> r.keep_id;

DELETE FROM "City" a
USING "City" b
WHERE a.slug = b.slug
  AND a.id <> b.id
  AND (b."name" ~ '[^\x00-\x7F]', -b.id) > (a."name" ~ '[^\x00-\x7F]', -a.id);

ALTER TABLE "City" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "City_slug_key" ON "City"("slug");
