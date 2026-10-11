-- Two-step booking (spec §16): a player's slot can wait for the club's
-- confirmation. The new enum value lands in its own migration because
-- PostgreSQL cannot use a value added to an enum in the same transaction.
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL' AFTER 'PENDING_PAYMENT';
