-- Who a group training is for: 'beginner' | 'intermediate' | 'advanced'.
-- NULL = open to every level (and what every existing session is).
ALTER TABLE "GroupSession" ADD COLUMN IF NOT EXISTS "level" TEXT;
