-- Courts default to 60-minute slots unless a club explicitly chooses finer
-- granularity. Existing rows keep whatever they already store.
ALTER TABLE "Resource" ALTER COLUMN "slotIntervalMin" SET DEFAULT 60;
