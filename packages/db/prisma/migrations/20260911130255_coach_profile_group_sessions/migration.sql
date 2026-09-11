-- AlterTable
ALTER TABLE "CoachProfile" ADD COLUMN     "hourlyRateCents" INTEGER;

-- CreateTable
CREATE TABLE "GroupSession" (
    "id" SERIAL NOT NULL,
    "coachProfileId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSessionRegistration" (
    "id" SERIAL NOT NULL,
    "groupSessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupSessionRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupSession_reservationId_key" ON "GroupSession"("reservationId");

-- CreateIndex
CREATE INDEX "GroupSession_coachProfileId_idx" ON "GroupSession"("coachProfileId");

-- CreateIndex
CREATE INDEX "GroupSession_clubId_idx" ON "GroupSession"("clubId");

-- CreateIndex
CREATE INDEX "GroupSession_startsAt_idx" ON "GroupSession"("startsAt");

-- CreateIndex
CREATE INDEX "GroupSessionRegistration_groupSessionId_idx" ON "GroupSessionRegistration"("groupSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSessionRegistration_groupSessionId_userId_key" ON "GroupSessionRegistration"("groupSessionId", "userId");

-- AddForeignKey
ALTER TABLE "GroupSession" ADD CONSTRAINT "GroupSession_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSession" ADD CONSTRAINT "GroupSession_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSession" ADD CONSTRAINT "GroupSession_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSessionRegistration" ADD CONSTRAINT "GroupSessionRegistration_groupSessionId_fkey" FOREIGN KEY ("groupSessionId") REFERENCES "GroupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSessionRegistration" ADD CONSTRAINT "GroupSessionRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
