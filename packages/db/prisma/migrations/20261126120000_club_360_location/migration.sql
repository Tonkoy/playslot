-- A first pin for 360 Тенис клуб on the clubs map: the point of its street
-- address (бул. „Цариградско шосе“ 31, София), so the map is not empty. It is a
-- starting position only: club staff move it to the entrance from the club's
-- settings. Left alone if someone has already set one.
UPDATE "Club"
SET "lat" = 42.68803, "lng" = 23.34157
WHERE "slug" = '360-tennis-club' AND "lat" IS NULL AND "lng" IS NULL;
