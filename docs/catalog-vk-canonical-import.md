# VK Canonical Import Plan

## Purpose

R5.3.6 converts explicitly reviewed VK candidates into a freshly validated
canonical import plan.

The first R5.3.6 boundary is intentionally read-only.

It does not write PostgreSQL and does not mutate the tracked canonical catalog.

## Trusted input

The planner receives:

- the exact VK candidate set;
- the exact candidate artifact SHA-256;
- a Review Artifact;
- canonical categories;
- the current canonical comic set used for dry-run comparison.

Review Artifact `canonical`, `validation`, `preview`, and `acceptedReady` values
are not trusted as import input.

The artifact is restored through the strict R5.3.5 restore boundary. Candidate
identity and candidate SHA must match. Reviewer-owned draft and decision state
are then analyzed again.

## Accepted boundary

Only entries whose decision is `accepted` may enter an import plan.

Every accepted entry must still be `acceptedReady` after fresh analysis.

If even one accepted entry is blocked, the whole plan fails. R5.3.6 must not
silently import a partial subset of accepted entries.

Pending, skipped, and postponed entries are not imported.

## Canonical validation

Canonical rows are reconstructed from the restored draft.

The complete accepted batch is passed through the existing Comic Diary
canonical validator before the plan is returned.

## Dry-run actions

Every accepted canonical comic receives one action:

- `create`;
- `update`;
- `unchanged`.

The action is recomputed against the supplied current canonical comic set.

No serialized preview action from Review Artifact is trusted.

## Write boundary

This stage performs no database writes.

A later R5.3.6 stage will:

1. compare the freshly validated plan with PostgreSQL;
2. preserve personal `user_comics` state;
3. apply only explicit create/update operations;
4. avoid implicit deletion;
5. record durable import receipts;
6. make successfully imported review entries disappear from the active queue
   while preserving review/import history.

## Durable import receipts

R5.3.6 stores successful import history separately from comic metadata and
personal reading state.

The `catalog_import_receipts` table records:

- candidate artifact SHA-256;
- source snapshot SHA-256;
- VK community ID;
- candidate ID;
- VK album ID;
- resulting comic slug;
- deterministic canonical comic SHA-256;
- applied action;
- import timestamp.

Receipt identity is:

`candidateSha256 + candidateId + canonicalSha256`.

This proves that one exact canonical representation of one exact reviewed
candidate was processed.

A later edited canonical draft receives a different canonical SHA-256 and is
therefore eligible for another explicit import.

A receipt does not replace database comparison. A candidate counts as currently
imported only when:

1. a matching receipt exists; and
2. the current PostgreSQL comic still equals the reviewed canonical comic.

This protects against later database drift.

Receipts intentionally have no foreign key to comics. Catalog lifecycle changes
must not destroy import history.

Receipt operations must never mutate `user_comics`.

## Database-aware dry-run

The R5.3.6 database-aware planner treats PostgreSQL as the final source of truth
for the action required at import time.

The earlier canonical-plan action is advisory only. The database-aware plan
recomputes the result immediately before apply.

Possible actions are:

- `create` — the reviewed slug is absent from PostgreSQL;
- `update` — the slug exists but canonical metadata differs;
- `unchanged` — PostgreSQL already equals canonical metadata but no matching
  durable receipt exists;
- `imported` — PostgreSQL equals canonical metadata and the exact
  candidate/canonical receipt already exists.

A matching historical receipt does not hide later database drift. If comic
metadata changes after a successful import, the database-aware action becomes
`update`.

Canonical receipt hashes use an explicit deterministic field order and cover all
canonical comic metadata.

The database-aware planner is read-only. It does not modify comics, receipts or
personal `user_comics` state.

## Transactional apply

R5.3.6C introduces the first database write boundary for reviewed VK catalog
imports.

The entire accepted canonical batch is applied inside one PostgreSQL
transaction.

Before mutation, the canonical batch is freshly validated again.

Inside the transaction the importer:

1. acquires a PostgreSQL transaction-scoped advisory lock for Comic Diary
   catalog imports;
2. resolves every referenced category from PostgreSQL;
3. recomputes the current comic and receipt state;
4. chooses `create`, `update`, `unchanged`, or `imported`;
5. mutates only catalog comic metadata when required;
6. writes the durable receipt in the same transaction.

The earlier review preview and database-aware dry-run remain advisory. Apply
never trusts a stale action supplied by either layer.

`unchanged` writes no comic metadata. It only records the missing durable
receipt.

`imported` writes neither the comic nor another receipt.

A historical receipt does not prevent repair. If PostgreSQL metadata has drifted
from canonical metadata, apply performs `update`. The existing exact receipt may
remain the durable proof for that canonical representation.

No source absence causes deletion or archival.

R5.3.6C does not modify `user_comics`.

If any comic or receipt operation fails, PostgreSQL rolls back the complete
accepted batch. Partial successful imports are not allowed.

Categories are resolved but are not implicitly created, deleted, or edited by
the VK apply boundary.

## HTTP import boundary

R5.3.6D exposes the reviewed catalog pipeline through one server-side JSON
endpoint:

`POST /api/admin/catalog-import/vk/import`

The request supplies:

- the exact candidate artifact SHA-256;
- the Review Artifact;
- `mode: "dry-run"` or `mode: "apply"`;
- `confirmApply: true` for a write request.

Authorization is checked before the request body is processed.

The temporary R5 admin-import session is isolated behind
`authorizeAdminCatalogImportRequest`.

R6 may replace that temporary session check with authenticated user and `ADMIN`
role authorization without changing the canonical import pipeline.

`ADMIN_IMPORT_ENABLED` remains an independent feature gate. Having the future
`ADMIN` role alone must not implicitly enable catalog imports.

The endpoint also requires a same-origin browser request. Reverse-proxy
`X-Forwarded-Proto` and the public `Host` header are used when reconstructing the
expected origin.

The server never trusts a serialized Review Artifact canonical result, validation
result, preview action, or `acceptedReady` flag.

For both modes it reloads the tracked candidate source, verifies its exact
SHA-256, restores reviewer-owned state, performs fresh review analysis, and
rebuilds the canonical plan.

`dry-run` performs a fresh PostgreSQL-aware comparison and does not write.

`apply` requires explicit confirmation and then delegates to the R5.3.6C
transactional apply boundary. The final database action is recomputed inside the
transaction.

The endpoint performs no delete operation and has no `user_comics` write path.

Production may deploy the endpoint while keeping it unavailable by leaving
`ADMIN_IMPORT_ENABLED` disabled.
