-- 360 Тенис клуб is in Борисова градина, on the park side of
-- бул. „Цариградско шосе“ — not at the street number its address geocodes to,
-- which is across the boulevard (the previous migration's starting guess).
-- This is the tennis grounds there as mapped in OpenStreetMap. It replaces only
-- an empty position or that earlier guess; a pin set by club staff is left alone.
UPDATE "Club"
SET "lat" = 42.68717, "lng" = 23.34105
WHERE "slug" = '360-tennis-club'
  AND (
    ("lat" IS NULL AND "lng" IS NULL)
    OR (abs("lat" - 42.68803) < 0.00001 AND abs("lng" - 23.34157) < 0.00001)
  );
