-- Moderation: suspend (reinstatement fee) / soft-delete accounts.
CREATE TYPE "SuspensionReason" AS ENUM ('NO_SHOW', 'NON_PAYMENT', 'OTHER');

ALTER TABLE "User"
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspensionReason" "SuspensionReason",
  ADD COLUMN "suspensionNote" TEXT,
  ADD COLUMN "reinstatementFeeCents" INTEGER,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Feedback on past bookings / group trainings (feeds coach ratings).
CREATE TABLE "SessionFeedback" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "reservationId" INTEGER,
    "groupSessionId" INTEGER,
    "coachProfileId" INTEGER,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SessionFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "SessionFeedback_target_check" CHECK (("reservationId" IS NULL) <> ("groupSessionId" IS NULL))
);

CREATE UNIQUE INDEX "SessionFeedback_userId_reservationId_key" ON "SessionFeedback"("userId", "reservationId");
CREATE UNIQUE INDEX "SessionFeedback_userId_groupSessionId_key" ON "SessionFeedback"("userId", "groupSessionId");
CREATE INDEX "SessionFeedback_coachProfileId_idx" ON "SessionFeedback"("coachProfileId");
CREATE INDEX "SessionFeedback_clubId_idx" ON "SessionFeedback"("clubId");

ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_groupSessionId_fkey" FOREIGN KEY ("groupSessionId") REFERENCES "GroupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
