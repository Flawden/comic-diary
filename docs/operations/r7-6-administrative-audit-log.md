# R7.6 — Administrative Audit Log

R7.6 adds a durable append-only administrative audit trail for authenticated
catalog/editorial and account/security mutations.

## Event model

`administrative_audit_events` stores:

- authenticated actor user id;
- actor role at the moment of the action;
- canonical action;
- target type;
- target id when the target has a numeric database id;
- stable target key;
- bounded JSON metadata;
- server-generated timestamp.

The actor role is captured as event state rather than derived later. A later
role change therefore does not rewrite the historical meaning of an event.

## Atomicity

Audit events are inserted inside the same PostgreSQL transaction as the
mutation they describe.

If the audit insert fails, the corresponding catalog/account/import mutation
rolls back. If the mutation rolls back, no successful audit event remains.

There is no application update/delete mutation boundary for
`administrative_audit_events`.

## Covered actions

Editorial/content actions:

- `CATEGORY_CREATE`;
- `CATEGORY_UPDATE`;
- `COMIC_CREATE`;
- `COMIC_UPDATE`.

Bulk administrative import:

- `VK_IMPORT_APPLY`.

Account/security actions:

- `ACCOUNT_ROLE_CHANGE`;
- `ACCOUNT_ACTIVE_CHANGE`;
- `ACCOUNT_ENTITLEMENTS_CHANGE`.

A single account PATCH can produce more than one audit event when several
independent authority/state dimensions change atomically.

The VK import records one batch-level audit event. Existing
`catalog_import_receipts` remain the item-level import provenance source and
are not repurposed as the administrative audit log.

## Role distinction

EDITOR and ADMIN can create content audit events only by crossing the existing
`EDIT_SHARED_CATALOG` mutation boundary.

Bulk import remains guarded by `RUN_BULK_IMPORT` and its independent feature
gate.

Account mutations remain guarded by `ADMIN_USERS`.

The audit read surface `/admin/audit` is ADMIN-only through
`ADMIN_SECURITY`. UI visibility is not the security boundary for mutations;
all existing request-level authorization remains authoritative.

## Secret exclusion

Audit details are explicitly curated. They do not contain:

- password hashes;
- raw passwords;
- session token hashes;
- raw session tokens;
- authentication cookies.

The read model joins only actor display identity and never selects password or
session-secret fields.

## R8 boundary

R7.6 records account-entitlement administration, including
`PRIVATE_CATALOG`, but does not implement R8.2 private-catalog behavior.
