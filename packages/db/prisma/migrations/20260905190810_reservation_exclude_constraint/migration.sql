-- Booking integrity & concurrency (spec §8).
-- Double-booking is made physically impossible at the DB layer: no two ACTIVE
-- ReservationResource rows for the same resource may have overlapping periods.
-- Because the guard sits on ReservationResource, one constraint protects courts
-- AND coaches ("a coach can't be in two places at once" falls out for free).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "ReservationResource"
  ADD CONSTRAINT no_resource_overlap
  EXCLUDE USING gist ("resourceId" WITH =, period WITH &&)
  WHERE ("isActive");

-- Keep ReservationResource.isActive in sync with the parent reservation status.
-- Occupying statuses (spec §6/§8): HOLD, PENDING_PAYMENT, CONFIRMED, COMPLETED.
-- A cancel/expiry/refund flips isActive to false, releasing inventory instantly.
CREATE OR REPLACE FUNCTION sync_reservation_resource_active() RETURNS trigger AS $$
BEGIN
  UPDATE "ReservationResource"
     SET "isActive" = (NEW.status IN ('HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'))
   WHERE "reservationId" = NEW.id
     AND "isActive" <> (NEW.status IN ('HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_rr_active ON "Reservation";
CREATE TRIGGER trg_sync_rr_active
  AFTER UPDATE OF status ON "Reservation"
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_reservation_resource_active();
