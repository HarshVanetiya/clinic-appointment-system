-- No double booking, ever: Postgres rejects any two non-cancelled bookings for the
-- same therapist whose [starts_at, blocked_until) ranges overlap. blocked_until
-- includes the service's buffer time. Cancelled rows drop out of the constraint,
-- so cancelling frees the slot immediately.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "therapist_id" WITH =,
    tstzrange("starts_at", "blocked_until", '[)') WITH &&
  ) WHERE ("status" <> 'cancelled');
