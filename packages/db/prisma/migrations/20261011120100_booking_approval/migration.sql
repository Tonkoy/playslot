-- Per-club switch: when on, a player's booking is held as PENDING_APPROVAL
-- until club staff confirm it.
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "requiresBookingApproval" BOOLEAN NOT NULL DEFAULT false;

-- A slot awaiting confirmation must hold its court, exactly like a paid one —
-- otherwise two players could be "awaiting confirmation" for the same hour.
-- Keeps ReservationResource.isActive in sync (see the EXCLUDE constraint).
CREATE OR REPLACE FUNCTION sync_reservation_resource_active() RETURNS trigger AS $$
BEGIN
  UPDATE "ReservationResource"
     SET "isActive" = (NEW.status IN ('HOLD', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED', 'COMPLETED'))
   WHERE "reservationId" = NEW.id
     AND "isActive" <> (NEW.status IN ('HOLD', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED', 'COMPLETED'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rows inserted while the parent is PENDING_APPROVAL must start active too.
UPDATE "ReservationResource" rr
   SET "isActive" = true
  FROM "Reservation" r
 WHERE rr."reservationId" = r.id
   AND r.status = 'PENDING_APPROVAL'
   AND rr."isActive" = false;
