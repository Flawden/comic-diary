-- AUTH-01 D2C4B3B3B F1: close SQL CHECK UNKNOWN/NULL loophole.
-- 0037 is immutable. This complementary constraint is TWO-VALUED only:
-- if a dispatch reservation timestamp exists, its generation MUST be non-NULL.
-- Paired with 0037 shape check, which already requires generation > 0.
-- No data repair, send/enable mechanism or production action.
ALTER TABLE "activation_mail_outbox"
  ADD CONSTRAINT "activation_mail_outbox_reservation_generation_present_check"
  CHECK (
    "dispatch_reservation_at" IS NULL
    OR "dispatch_reservation_generation" IS NOT NULL
  );
