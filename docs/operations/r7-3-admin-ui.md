# R7.3A — bounded Admin UI

## Goal

R7.3A turns the already-existing administration backend into a usable
server-rendered management surface without expanding the database schema.

Routes:

- `/admin` — capability-aware dashboard;
- `/admin/comics` — create/update shared catalog comics;
- `/admin/users` — role and active-state administration;
- `/admin/catalog-import/vk` — existing VK import workspace, linked rather
  than rewritten.

## Authorization model

Page visibility follows the existing role permissions:

- `EDIT_SHARED_CATALOG` → catalog management;
- `ADMIN_USERS` → account administration;
- `RUN_BULK_IMPORT` → VK import.

EDITOR therefore receives catalog management but not user administration
or bulk import.

This page access model is **not** the mutation security boundary. Existing
mutation APIs re-authorize every POST/PATCH request independently.

## Read side

There are no existing admin GET/list APIs.

R7.3A therefore uses server-side Drizzle read models directly from Server
Components:

- all comics, including HIDDEN and ARCHIVED;
- categories;
- users without password hashes or session secrets.

No new public JSON read API is introduced.

## Comic administration

The existing `/api/admin/catalog/comics` API is reused:

- POST creates a comic;
- PATCH updates metadata;
- slug remains immutable on update;
- category must resolve to an existing category;
- no DELETE is introduced in R7.3A.

The UI exposes the complete existing `CatalogComic` contract:
title, description, author, translator, translator note, cover URL,
source URL, total chapters, publication status and category.

## User administration

The existing `/api/admin/users/[id]` PATCH API is reused.

The UI can change only:

- role;
- active state.

It never exposes or accepts password/session secrets.

Dangerous authority reductions require a browser confirmation. The backend
still owns the real safety rules, including the `last-active-admin` guard
and session revocation after authority/state changes.

If the current administrator changes their own authority/state, the UI
returns to login because the backend revokes that account's sessions.

## Explicitly deferred

- comic deletion;
- category CRUD;
- password reset by administrator;
- session/device inspection;
- security audit log UI;
- public recovery workflow.

## Migration

None.
