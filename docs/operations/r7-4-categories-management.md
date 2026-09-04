# R7.4 — Categories Management

## Goal

R7.4 adds bounded category administration to the existing role-aware admin
workspace without creating a second shared-catalog mutation model.

Routes:

- `/admin/categories` — category create/update UI;
- `/api/admin/catalog/categories` — POST/PATCH mutation boundary.

## Authorization

Category administration uses the existing `EDIT_SHARED_CATALOG` permission.
EDITOR and ADMIN may create and edit categories. USER may not.

The UI gate is not the security boundary. Every category POST/PATCH request
reuses `authorizeSharedCatalogMutationRequest`, including same-origin and
session/permission checks before request-body parsing.

## Canonical write path

Categories reuse the same `SHARED_CATALOG_ADVISORY_LOCK` already used by
manual comic mutations and canonical bulk import. Category payloads are
validated through `validateCatalogData` before database mutation.

## Identity and references

Category slug is canonical identity:

- POST accepts a new slug;
- PATCH uses the existing slug as selector;
- PATCH changes only name/description/updatedAt;
- slug rename is not implemented.

Keeping slug immutable avoids silently invalidating catalog input/import
references that use `categorySlug`.

Existing comic rows reference `categories.id`; editing category metadata does
not rewrite those references.

## Deletion policy

R7.4 intentionally exposes no DELETE handler and no delete button.

The database foreign key currently uses `onDelete: "set null"`, but R7.4 does
not treat that database behavior as permission to destructively remove a
shared category. Reference-protection policy is therefore fail-closed at the
administrative surface: no category deletion is available.

## Read side

`listAdminCategories` is extended to include description and updatedAt for the
server-rendered category editor. No new public category GET API is introduced.

## Migration

None.

## Deferred

- category deletion or archival model;
- category slug rename/alias migration;
- administrative audit log;
- entitlement management.
