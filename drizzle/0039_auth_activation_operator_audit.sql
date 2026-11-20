-- B3B3C: append-only audit vocabulary for operator control transitions.
-- Existing durable control row remains OFF unless explicitly changed by an
-- authenticated administrative transaction. No mail provider or network grant.
-- PostgreSQL enum labels become usable AFTER the migration transaction commits.
ALTER TYPE "administrative_audit_action" ADD VALUE IF NOT EXISTS 'ACTIVATION_DISPATCH_CONTROL_CHANGE';
--> statement-breakpoint
ALTER TYPE "administrative_audit_target" ADD VALUE IF NOT EXISTS 'ACTIVATION_DISPATCH_CONTROL';
