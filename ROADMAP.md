# Comic Diary Roadmap

This document is the canonical development roadmap for Comic Diary.

It records both completed historical milestones and the planned direction of the project.

## Product Goal

Comic Diary is a personal reading diary and catalog for comics.

The application should allow a reader to:

- browse a catalog of comics;
- open a comic detail page;
- follow the original reading source without hosting comic pages;
- maintain a personal reading library;
- track reading status and progress;
- rate comics;
- keep personal notes;
- use the application comfortably on desktop and mobile;
- eventually use multiple languages and authenticated user accounts.

The current project is a modular monolith built with:

- TypeScript;
- React;
- Next.js App Router;
- Tailwind CSS;
- PostgreSQL;
- Drizzle ORM;
- Docker;
- GitHub Actions.

---

# R0 — Product Concept

Status: COMPLETE

The initial product concept and technical direction were established.

Key decisions:

- personal comic reading diary and catalog;
- source comic pages remain external;
- application stores metadata and personal reading data;
- initial catalog category: "Чайная территория";
- mobile-friendly responsive interface;
- cozy cream and dark-green visual direction;
- PostgreSQL as persistent storage;
- modular monolith architecture;
- future support for authentication, internationalization and PWA.

---

# R1 — Application Foundation

Status: COMPLETE

Foundation of the application and development workflow.

Completed:

- Next.js application bootstrap;
- TypeScript configuration;
- Tailwind CSS foundation;
- project directory structure;
- Git repository baseline;
- PostgreSQL development database;
- Docker Compose;
- Drizzle ORM;
- database migrations;
- centralized environment configuration;
- application-to-database connection;
- Dockerized Next.js application;
- production-style standalone build;
- GitHub Actions CI;
- lint, typecheck, application build and Docker build gates.

---

# R2 — Catalog Core

Status: COMPLETE

Core comic catalog model and read-only catalog experience.

Completed:

- categories database model;
- comics database model;
- comic slug support;
- descriptions;
- cover URL support;
- source URL support;
- chapter count;
- category relationship;
- repeatable development seed;
- catalog query layer;
- comic catalog cards;
- comic detail route;
- external source link;
- empty/fallback cover handling.

---

# R3 — Personal Library

Status: COMPLETE

Checkpoint:

- commit: 76e40b4
- CI run: 33268384962
- CI job: 99142384121

Personal reading state is now persisted in PostgreSQL and exposed throughout the application.

## R3.1 — User Reading Progress Model

Completed:

- users table;
- user_comics table;
- reading status enum:
  - WANT_TO_READ;
  - READING;
  - COMPLETED;
  - ON_HOLD;
- current chapter;
- started timestamp;
- completed timestamp;
- user/comic uniqueness;
- non-negative progress constraint;
- cascade relationships.

## R3.2 — Reading State on Comic Page

Completed:

- development reader identity;
- user comic state query;
- reading state visible on comic detail page.

## R3.3 — Reading State Mutations

Completed:

- change reading status;
- increase chapter progress;
- decrease chapter progress;
- automatic WANT_TO_READ -> READING transition;
- automatic completion at final known chapter;
- COMPLETED -> READING transition when progress decreases;
- chapter range protection;
- mutation validation;
- POST/303 form workflow.

## R3.4 — Add to Library

Completed:

- add comic to personal library;
- default WANT_TO_READ state;
- initial progress 0;
- idempotent insert.

## R3.5 — Remove from Library

Completed:

- remove comic from personal library;
- idempotent removal;
- detail page empty-library state.

## R3.6 — Personal Library Page

Completed:

- /library route;
- library query layer;
- comic cards;
- reading status;
- reading progress;
- library statistics;
- empty-library state.

## R3.7 — Global Navigation

Completed:

- shared application navigation;
- catalog link;
- personal library link;
- redundant page-level back links removed.

## R3.8 — Real Home Dashboard

Completed:

- real PostgreSQL-backed dashboard;
- current reading comic;
- real chapter progress;
- progress percentage;
- real library counters;
- no-reading state;
- removal of prototype/fake user data.

## R3.9 — Library Status Filters

Completed:

- All;
- Reading;
- Want to Read;
- Completed;
- On Hold;
- URL-driven filters;
- empty filtered-state handling;
- invalid-filter fallback.

## R3.10 — Navigable Library Statistics

Completed:

- reusable LibraryStat component;
- clickable status statistics;
- links from dashboard to filtered library;
- links from library statistics to filters;
- obsolete diary component removed.

---

# R4 — Ratings & Personal Notes

Status: COMPLETE

## R4.1 — Ratings & Personal Notes Data Model

Status: COMPLETE

Completed:

- plot rating storage;
- characters rating storage;
- art rating storage;
- depth rating storage;
- world rating storage;
- nullable personal note;
- rating values constrained to 1..5 at database level;
- partially filled ratings supported;
- development seed remains compatible.

## R4.2 — Ratings Query Layer

Status: COMPLETE

Completed:

- comic reading-state query exposes all five ratings;
- comic reading-state query exposes the personal note;
- reusable PersonalRatings type;
- average rating calculation;
- empty ratings return no average;
- partially filled ratings are averaged using only filled dimensions;
- fully filled ratings preserve decimal averages.

## R4.3 — Edit Ratings & Personal Notes

Status: COMPLETE

Completed:

- edit five personal rating dimensions from the comic detail page;
- leave individual rating dimensions empty;
- save and clear a personal text note;
- validate rating values at the HTTP boundary;
- validate rating values again in the mutation layer;
- persist ratings and notes in PostgreSQL;
- display the calculated average rating on the comic detail page;
- support partial rating updates and clearing existing values;
- development seed restores a clean ratings and notes baseline.

## R4.4 — Personal Rating in Library

Status: COMPLETE

Completed:

- personal library query exposes all five rating dimensions;
- personal library query exposes personal note presence;
- library cards calculate the personal average rating;
- unrated comics show an explicit no-rating state;
- rated comics show the average score out of 5;
- comics with a personal note show a lightweight note indicator;
- personal note text remains on the comic detail page rather than expanding library cards.

## R4 Acceptance

Status: COMPLETE

Validated:

- schema and migration contracts;
- live PostgreSQL rating columns and range constraints;
- average rating behavior for empty, partial, and full ratings;
- comic detail and personal library query layers;
- mutation-layer and HTTP-boundary validation;
- end-to-end rating and personal note persistence;
- comic detail page runtime rendering;
- personal library runtime rendering;
- invalid rating rejection;
- partial rating updates and clearing values;
- repeatable development seed reset;
- lint, typecheck, production build, and Docker build;
- clean repository state after the acceptance audit.

Goal:

Add the personal opinion layer of the reading diary.

Planned capabilities:

- plot rating;
- characters rating;
- art rating;
- depth rating;
- world rating;
- values from 1 to 5;
- average rating calculated from filled rating dimensions;
- personal text notes;
- edit existing ratings and notes;
- show personal rating on comic detail page;
- expose useful rating information in the personal library.

This stage should extend the existing user_comics domain rather than introduce authentication concerns.

---

# R5 — Real Catalog Data

Status: IN PROGRESS

Goal:

Move from development seed content to a useful real comic catalog.

## R5.1 — Catalog Import Foundation

Status: COMPLETE

Checkpoint:

- commit: 6540a6e
- CI run: 33319449692
- CI job: 99278733358

Completed:

- stable category slug business key;
- canonical typed catalog dataset;
- catalog validation and duplicate slug detection;
- repeatable idempotent catalog importer;
- catalog import separated from development fixtures;
- repeatable development seed built on top of the catalog import;
- category slug migration and live database contract;
- catalog import and development seed idempotency validation.

## R5.2 — Canonical Comic Metadata

Status: COMPLETE

Checkpoint:

- commit: 610a260fedd843de09cf55f8885e4ed5ab8aeb9d
- CI run: 33321946096
- CI job: 99285337426

Completed:

- added canonical author metadata;
- added translator metadata and translator notes;
- added the `PUBLISHED`, `HIDDEN`, and `ARCHIVED` publication lifecycle;
- added additive migration `0005_lucky_juggernaut.sql`;
- migrated existing comics safely to `PUBLISHED`;
- kept public catalog discovery limited to published comics;
- preserved hidden and archived comics in personal library history;
- preserved direct detail access for hidden and archived library entries;
- extended the catalog importer and validator for canonical metadata;
- made the development fixture deterministic for the new metadata fields;
- exposed author, translator, translator note, and lifecycle state on comic details;
- documented the XLSX/CSV bulk catalog input contract;
- validated catalog import and development seed idempotency;
- validated production build and fresh Docker runtime;
- validated publication lifecycle behavior against the live database and application.

## R5.3 — Real Catalog Dataset

Status: IN PROGRESS

Goal:

Build a safe and reviewable pipeline for discovering the real White Dragon catalog from VK, reviewing uncertain metadata, and importing accepted data through the canonical Comic Diary catalog pipeline.

Primary source:

- VK community: `comics_white_dragon`.

Fallback sources:

- XLSX;
- UTF-8 CSV;
- manually reviewed canonical data.

Architecture:

VK → read-only discovery → raw snapshot → candidates → human review → validation → dry-run → idempotent import → PostgreSQL.

Safety rules:

- VK credentials remain server-side only;
- credentials are never committed, persisted in browser storage, or written to logs;
- discovery and candidate generation never mutate the canonical catalog;
- every import passes the canonical validator;
- repeated import of the same accepted dataset is idempotent;
- source disappearance never implicitly deletes comics or personal history.

### R5.3.1 — Admin Import Shell

Status: COMPLETE

- add `/admin/catalog-import/vk`;
- add a temporary server-side admin gate until R7 authentication;
- accept VK community URL and temporary service token;
- keep the token server-side and ephemeral;
- provide connection/discovery status UI;
- keep the first implementation read-only.

### R5.3.2 — VK Connection & Discovery

Status: COMPLETE

- resolve and validate the VK community;
- inspect albums, photos, wall entries, links, and useful community metadata;
- determine the real publication structure before defining parser rules;
- produce deterministic discovery results without catalog writes.

### R5.3.3 — Raw VK Snapshot

Status: COMPLETE

- define a versioned raw snapshot contract;
- preserve VK identifiers, source URLs, timestamps, and evidence;
- exclude credentials from snapshots;
- allow parser development without repeatedly requesting VK.

### R5.3.4 — Candidate Normalization

Status: COMPLETE

- derive title, slug, description, source URL, cover, authorship, translator metadata, and reliable chapter information;
- preserve evidence for every derived field;
- explicitly mark uncertain or missing metadata;
- never silently invent values.

### R5.3.5 — Review Console

Status: COMPLETE

- show candidates, warnings, evidence, and existing catalog matches;
- allow editing, accepting, skipping, and postponing candidates;
- detect duplicate slugs and invalid metadata;
- preview create/update/unchanged decisions.

### R5.3.6 — Canonical Import

Status: COMPLETE

Completed:

- A — convert accepted Review Artifact entries into the canonical catalog contract;
- B1 — add durable `catalog_import_receipts` identity records;
- B2 — perform fresh PostgreSQL-aware CREATE / UPDATE / UNCHANGED / IMPORTED planning;
- C — apply the whole accepted batch atomically inside one PostgreSQL transaction;
- C — recompute current database state inside the transaction before writing;
- C — preserve `user_comics` progress, ratings and personal notes;
- C — prove whole-batch rollback when a later item fails;
- D — expose one guarded server-side import API boundary;
- D — require exact candidate SHA-256 and rebuild canonical state server-side;
- D — keep the production feature gate independent and disabled by default;
- E — connect the Review Console to fresh database dry-run results;
- E — require explicit confirmation before apply;
- E — expose CREATE / UPDATE / UNCHANGED / IMPORTED states in the review UI;
- E — remove imported cards only from the active READY queue while preserving review history;
- preserve durable receipt history without implicit catalog deletion;
- keep comic pages external and import metadata/source links only.

The complete path is now:

VK → raw snapshot → candidates → human review → canonical validation →
database-aware dry-run → explicit confirmation → atomic PostgreSQL apply →
durable receipt → IMPORTED UI state.

Production catalog import remains disabled until real R6 ADMIN authorization is
integrated and the independent feature gate is intentionally enabled.

### R5.3.7 — Initial Real Dataset & VK Sync

Status: PLANNED

- discover and review the real `comics_white_dragon` catalog;
- import the first real dataset;
- rerun discovery and classify new, changed, unchanged, and unresolved candidates;
- retain XLSX/CSV as fallback import paths;
- prepare the project for R5.4 real catalog acceptance.
## R5.4 — Real Catalog Acceptance

Status: PLANNED

Planned work:

- validate real catalog duplicates and references;
- validate repeatable catalog import;
- validate public visibility rules;
- validate real comic detail pages;
- validate development fixture isolation;
- complete local, Docker, and CI acceptance.

Comic pages remain external; the application should link to the approved source rather than host comic pages.
---

# R6 — Authentication & Roles

Status: IN PROGRESS

Goal:

Replace the development-only reader identity and temporary admin secret with
real authenticated accounts and server-side authorization.

Core decisions:

- preserve the existing `users` and `user_comics` identity graph;
- R6.1 initially persists `USER` and `ADMIN`;
- expand the authorization model to `USER`, `EDITOR`, and `ADMIN` before final R6 acceptance;
- roles represent authority over shared/system data, not product-plan capabilities;
- `EDITOR` inherits normal USER capabilities and may manage shared catalog content;
- `EDITOR` must not manage users, bans/account activation, roles, ADMIN security, or system-level controls;
- `ADMIN` inherits normal USER and EDITOR capabilities plus explicitly authorized administrative capabilities;
- optional account capabilities such as private personal catalog access must be modeled separately from roles;
- use opaque server-side sessions;
- store only session-token hashes in PostgreSQL;
- never store authentication secrets in localStorage;
- enforce authorization on the server;
- keep `ADMIN_IMPORT_ENABLED` as an independent production kill switch.

## R6.1 — Auth Data Model

Status: COMPLETE

Completed acceptance:

- extend existing users additively;
- add USER / ADMIN role;
- add account activation state;
- add password-hash storage without invalidating the existing development user;
- add hashed persistent sessions;
- preserve all existing user IDs and `user_comics`;
- validate upgrade migration and fresh migration paths.

## R6.2 — Login / Logout

Status: PLANNED

- dedicated password hashing with Argon2id or equivalent;
- normalized login identifier handling;
- create and verify opaque session tokens;
- HttpOnly production cookie;
- login page;
- logout;
- expired-session handling;
- inactive-user rejection;
- no raw session token in PostgreSQL.

## R6.3 — Request Identity & Authorization

Status: PLANNED

- resolve authenticated user for server-rendered pages;
- resolve authenticated user for route handlers;
- replace `DEV_USER_EMAIL` in personal product paths;
- make library, progress, ratings and notes belong to the authenticated user;
- extend the role model to `USER`, `EDITOR`, and `ADMIN`;
- define server-side permission checks instead of relying on role names in UI code;
- allow EDITOR to create and edit shared/public catalog content;
- prevent EDITOR from activating/deactivating users, assigning roles, banning users, changing ADMIN security, or controlling system-level features;
- require ADMIN for account administration, role management, security-sensitive operations, and system controls;
- keep bulk catalog import separately guarded and ADMIN-only unless a later explicit acceptance safely delegates it;
- preserve same-origin/CSRF protections where applicable;
- keep authorization independent from hidden UI controls.

## R6.4 — Admin Bootstrap

Status: PLANNED

- secure first-admin creation procedure;
- no hard-coded production admin password;
- only ADMIN may assign or remove staff roles;
- support USER / EDITOR / ADMIN role management;
- prevent accidental removal, demotion, or deactivation of the last active ADMIN;
- EDITOR must never be able to modify ADMIN authority;
- document emergency recovery.

## R6.5 — Authentication Production Proof

Status: PLANNED

- deploy additive auth and authorization migrations;
- validate anonymous behavior;
- validate USER behavior;
- validate EDITOR behavior;
- validate ADMIN behavior;
- validate session expiry/logout;
- prove personal data isolation between users;
- prove EDITOR can manage shared catalog content without obtaining account/security authority;
- prove EDITOR cannot alter ADMIN users, roles, activation state, or protected system controls;
- prove catalog import still requires both ADMIN and the independent feature flag unless an explicit later policy changes it;
- remove the temporary R5 admin-secret session only after replacement is proven.

---

# R7 — Admin Panel---

# R7 — Admin Panel

Status: PLANNED

Goal:

Turn existing protected import tooling into a coherent role-aware administration
and shared-catalog editing area.

## R7.1 — Staff Shell

- `/admin` dashboard;
- authenticated server boundary;
- role-aware navigation;
- EDITOR access only to explicitly delegated content-management areas;
- ADMIN access to account/security/system administration;
- service and catalog overview.

## R7.2 — Catalog Import Admin

- move the completed VK Review Console into the authenticated administration shell;
- preserve server-side dry-run and transactional apply;
- preserve durable import receipts and history;
- keep bulk import ADMIN-only initially because of its broad shared-catalog impact;
- intentionally enable production import only after authorization acceptance.

## R7.3 — Comics Management

- manually create canonical public comic entries;
- edit existing shared/public metadata;
- manage publication lifecycle;
- allow EDITOR and ADMIN through explicit server-side permission checks;
- reuse the same canonical validation and mutation rules as imports;
- do not create a competing write path;
- keep private user-owned titles outside the shared-catalog editing boundary.

## R7.4 — Categories Management

- create categories;
- edit category metadata;
- allow EDITOR and ADMIN through explicit permissions;
- protect references and avoid destructive deletion.

## R7.5 — Users & Roles

- ADMIN-only;
- list users;
- inspect account state;
- activate/deactivate users;
- USER / EDITOR / ADMIN role management;
- manage account entitlements separately from roles;
- last-active-ADMIN protection;
- EDITOR has no access to account punishment, ban, activation, or role controls.

## R7.6 — Administrative Audit Log

- record administrative or editorial actor;
- action;
- target;
- timestamp;
- import events;
- shared catalog edits;
- role/account changes;
- distinguish EDITOR content actions from ADMIN security/account actions.

---

# R8 — User Account & Catalog UX---

# R8 — User Account, Reading Diary & Catalog UX

Status: IN PROGRESS

Goal:

Finish the authenticated reader experience and evolve Comic Diary from a simple
progress tracker into a durable history of reading and changing opinion.

## R8.1 — Account & Catalog UX

Status: COMPLETE

- account/profile page;
- display-name management;
- improved personal library UX;
- improved ratings and notes UX;
- catalog title search;
- category filtering;
- sorting;
- publication-aware empty states;
- responsive catalog layout;
- better mobile navigation;
- optionally expose personal reading state directly in catalog cards.

## R8.2 — Private Personal Catalog

Status: COMPLETE

Product decision:

Private-catalog access is an account capability/entitlement, not an authorization
role.

Working product name may be `VIP`, `Plus`, or another user-facing label.
The internal capability should remain concept-oriented, for example
`PRIVATE_CATALOG`.

Planned behavior:

- STANDARD users track titles from the shared public catalog;
- an account with PRIVATE_CATALOG may add external titles for personal tracking;
- personal titles store metadata and external reading links only;
- Comic Diary still does not need to host comic pages;
- a private title belongs to exactly one user;
- private titles never appear in the public catalog;
- private titles never appear in another user's searches or library;
- EDITOR authority over the shared catalog does not grant access to another user's private titles;
- reuse the normal reading-state, progress, rating and note model where practical;
- avoid building a second incompatible diary subsystem;
- shared canonical import must never implicitly modify or delete private titles;
- prove owner isolation at query and mutation boundaries.

The likely data direction is to extend the canonical comic model with explicit
visibility/ownership rather than duplicate the entire comic and `user_comics`
domain, but the exact migration must be designed at implementation time.

## R8.3 — Canonical Chapters & Release Tracking

Goal:

Replace the free-running integer chapter counter with explicit released chapter
records, make reader progress impossible beyond actually available chapters, and
give EDITOR / ADMIN a practical workflow for maintaining new releases.

Product decisions:

- a chapter is a first-class child of a comic, with its own stable internal ID;
- the visible chapter number/code is **text**, not a decimal number;
- labels such as `1`, `1.01`, `1.01а`, `1.01б`, `Extra`, `Спецвыпуск` and other
  source-specific forms must be stored without trying to parse them numerically;
- chapter ordering is controlled by a separate internal integer sequence / sort
  position and must never be inferred from the visible label;
- chapter title is optional;
- chapter-specific source URL is optional and may fall back to the comic source;
- release/publication timestamp is optional when the exact date is unknown;
- inserting or reordering chapters must not invalidate existing reader state,
  because personal state binds to stable chapter IDs rather than display labels;
- once the chapter registry is authoritative, `comics.totalChapters` is no longer
  the reader's free-form progress ceiling; available/published chapter records are
  the source of truth for how far a reader can progress;
- the existing integer `user_comics.currentChapter` is transitional compatibility
  state and should be replaced or derived from chapter-backed reading state;
- a reader cannot mark chapter 12 or 211 as read when only 11 available chapter
  records exist;
- chapter rows should be shared by SHARED and PRIVATE titles rather than creating
  incompatible chapter subsystems.

Shared-catalog administration:

- preserve the existing `/admin/comics` manual comic create/edit workflow;
- after creating or opening a shared comic, provide a chapter manager in the admin
  area;
- EDITOR and ADMIN may add, edit, reorder and archive shared chapters through the
  explicit shared-catalog authorization boundary;
- avoid direct role-name checks in chapter mutation services; reuse explicit
  permission/authorization policy;
- prefer archive/hide over destructive deletion after a chapter has user reading
  state or ratings;
- private-title chapter management is owner-scoped and must never be granted by
  EDITOR shared-catalog authority.

Administrative audit requirements:

- record chapter create, metadata edit, reorder and archive actions;
- record the authenticated actor, action, comic target, chapter target and time;
- preserve enough before/after detail to understand what changed;
- extend the admin audit UI so ADMIN can conveniently filter/search by actor,
  action, comic/chapter target and time;
- make editorial chapter actions distinguishable from ADMIN account/security
  actions;
- do not silently overwrite chapter history in a way that makes responsibility
  impossible to reconstruct.

Release tracking:

- distinguish an **actual released chapter record** from an **expected future
  release date**; an expectation is never proof that a chapter was released;
- retain the useful personal `next_chapter_expected_at` idea as an optional reader
  reminder after the canonical chapter registry exists;
- show titles with unread released chapters from the difference between chapter
  records and the authenticated reader's chapter-backed reading state;
- later allow editor-managed expected release metadata where a source/translation
  provides reliable scheduling information;
- account for different sources/translations having different release schedules;
- later consider optional notifications on top of durable release facts.

Initial data direction:

- `comic_chapters`: stable ID, comic ID, display label/code, sort position, optional
  title, optional source URL, optional released-at timestamp, publication state,
  created/updated timestamps;
- `user_chapter_state`: user ID + chapter ID with read state/timestamp;
- chapter display label is never used as the relational key;
- ordering constraints operate on the internal sort position, not on parsed label
  semantics;
- R8.4 extends the same chapter identity for ratings instead of inventing another
  chapter-number key.

Acceptance examples:

- chapter labels `1`, `1.01`, `1.01а`, `1.01б`, `2` can be displayed exactly as
  entered while ordered by explicit sort position;
- a comic with 11 published chapters cannot record reader progress at chapter 12
  or 211;
- EDITOR/ADMIN can add a newly released shared chapter from the admin UI;
- the new chapter becomes available to readers without rewriting existing reading
  history;
- every staff chapter mutation is visible through the administrative audit log;
- another user's PRIVATE chapters remain invisible and immutable.

## R8.4 — Per-Chapter Ratings

Goal:

Capture how a title feels chapter by chapter using the canonical chapter records
from R8.3 instead of a fragile numeric chapter counter.

Planned behavior:

- allow the reader to rate individual existing chapter records;
- associate every chapter rating with user + stable `chapter_id`, never with a
  parsed/display chapter number;
- allow chapters with or without an optional human-readable title;
- keep the title-level/current overall opinion separate from chapter ratings;
- do not silently derive one metric from the other;
- do not allow ratings for nonexistent/future chapter identifiers;
- preserve ratings when a chapter display label or title is edited;
- if a chapter is archived after readers rated it, preserve the personal history
  and show the archived state rather than orphaning or silently deleting ratings;
- define the exact rating scale/fields at implementation time rather than coupling
  the schema prematurely;
- preserve timestamps needed for chronological analysis;
- if chapter ratings become editable, preserve enough history that meaningful
  diary chronology is not silently destroyed.

Candidate data direction:

- extend `user_chapter_state` with current rating data or use a tightly-related
  `user_chapter_rating` keyed by user + canonical chapter ID;
- optional rating-event history when edits need to be preserved;
- later analytics aggregate by canonical chapter ID / sequence, not display label.

## R8.5 — Reading Timeline & Opinion History

Goal:

Show the history of the reading experience, not only its current state.

Candidate timeline events:

- reading started;
- chapter progress;
- chapter rating;
- overall title-rating change;
- personal note;
- completion;
- return from ON_HOLD;
- expected-next-chapter changes where useful.

Planned UX:

- chronological reading diary per title;
- show where the reader stopped and what they thought at that point;
- visualize how personal opinion changed as chapters progressed;
- distinguish "this chapter was good/bad" from "my overall opinion of the title changed".

## R8.6 — Community Chapter Analytics

Goal:

Aggregate chapter-level ratings into useful spoiler-aware community insight.

Candidate metrics:

- average rating per chapter;
- rating count per chapter;
- rolling/moving average across chapters;
- average community rating up to the reader's current progress;
- comparison between the reader's curve and community curve;
- distribution by reading-progress bands;
- title-level opinion changes over progress where enough data exists.

Spoiler policy:

- by default, never expose future chapter-rating trends beyond the authenticated
  reader's current progress;
- allow explicitly revealing the full curve only behind a clear spoiler warning.

The analytics model must distinguish:

- ratings of individual chapters;
- a user's changing overall title opinion;
- cross-sectional ratings from users at different progress points.

These are different metrics and must not be silently mixed.

---


# Active Finish Workstream — Visual Product Completion

Status: IN PROGRESS

This is an implementation workstream for completing the current web product.
It does **not** rename or replace the existing canonical R8.3-R8.6 milestones.

Use `UI-F*` identifiers for this work so the already-defined roadmap numbering
remains stable.

## UI-F1 — Text Hierarchy & Surface Contrast

Status: COMPLETE

Goal:

Make the visual hierarchy readable and intentional while preserving themeability.

Scope:

- establish primary, secondary, muted and accent text roles;
- strengthen separation between background, surface and raised surface;
- keep component colors semantic rather than hard-coded;
- migrate remaining design-system preview references away from obsolete tokens;
- keep future themes capable of changing palette, typography, shape and elevation.

## UI-F2 — Covers & Media

Status: COMPLETE

Goal:

Make comic imagery a first-class product capability rather than a demo-only prop.

Scope:

- define the canonical comic cover/media contract;
- add a reusable `CoverImage` boundary;
- support fallback, loading and broken-image states;
- allow cover assignment/editing from administration;
- support image upload as well as externally sourced media where appropriate;
- decide persistent production storage separately from UI components;
- keep comic pages externally hosted; this project stores catalog/media metadata
  and reader data, not hosted comic-page content.

## UI-F3 — Catalog Surface Migration

Status: COMPLETE

Validated: typecheck, lint, webpack production build; Windows desktop and
390px catalog screenshots reviewed. Committed and pushed as 2e56a25.

- rebuild the real catalog using the shared design system;
- use real catalog data rather than duplicated preview fixtures;
- integrate cover imagery;
- preserve search/filter/sort behavior;
- keep responsive mobile-first presentation.

## UI-F4 — Library Surface Migration

Status: IN PROGRESS

Implementation checkpoint: dedicated library cards compose shared Card, Badge
and CoverImage with canonical progress, personal ratings and note previews.
Semantic borders/text, responsive list layout and 2-column home statistics are
applied. Windows desktop empty/populated/ratings-note states reviewed at cef92f8.
Mobile authenticated acceptance remains pending.

- distinguish catalog metadata from per-user reading state;
- show reading progress and personal state without contaminating catalog contracts;
- compose library-specific surfaces from shared domain/UI primitives.

## UI-F5 — Comic Detail & Chapter Surface Migration

Status: IN PROGRESS

Chapter-reading checkpoint: stable chapter IDs, MAIN/SPECIAL classification,
read-through actions, source links/search, separate read history, explicit completion
and revision replacement with archived predecessors. Migration 0016 imports the
existing ordered-count interpretation once; titles without a registry retain a
numeric fallback. Windows migration and real PostgreSQL probe passed at 6aa6199; desktop legacy
7/12, rating and note screenshot reviewed. Registered chapter and mobile
visual acceptance remain pending.

- rebuild `/comics/[slug]` around the new visual system;
- integrate canonical chapter records;
- surface release/read state clearly;
- preserve future chapter-rating and diary capabilities.

## UI-F6 — Admin Visual Migration

Status: PLANNED

- keep administration visually consistent with the reader application;
- use compact cards, sheets/panels and contextual actions;
- keep destructive actions explicit and confirmed;
- preserve authorization and audit behavior;
- avoid returning to giant always-open forms.

## UI-F7 — Account & Theme Selector

Status: PLANNED

- migrate account/profile surfaces;
- expose a user-facing diary style selector;
- persist the selected theme;
- initial style direction: Night Reader, Tea House and Paper Journal;
- allow later Manga/Noir-style variants without rewriting components.

## UI-F8 — UX Completion

Status: PLANNED

- loading and skeleton states;
- empty states;
- meaningful error states;
- save/action feedback;
- confirmation flows;
- mobile/touch review;
- keyboard/focus accessibility;
- responsive regression.

## UI-F9 — Web Release Hardening

Status: PLANNED

Before declaring the web application complete:

- lint;
- typecheck;
- production build;
- clean-database migration validation;
- seed validation;
- login/register smoke;
- catalog smoke;
- library smoke;
- chapter workflow smoke;
- cover/media smoke;
- admin CRUD and authorization smoke;
- audit smoke;
- responsive smoke;
- deployment verification;
- backup/recovery verification where applicable.

After UI-F9, avoid expanding the web application with new foundational UI
abstractions unless required by a concrete product feature. The next major product
surface should be the Android application using the established domain model,
workflows and visual/UX decisions.

---

# R9 — Production Reliability & Security

Status: PLANNED

Goal:

Harden the already deployed production system for real user data.

Existing baseline already includes:

- immutable Docker image deployment;
- private GHCR release images;
- restricted SSH deployment identity;
- production migrations;
- private PostgreSQL networking;
- HTTPS reverse proxy;
- public health verification.

Remaining work:

- permanent application domain;
- PostgreSQL off-site backups;
- documented restore procedure;
- authentication/login rate limiting;
- security headers;
- session policy hardening;
- CSRF review;
- application/error monitoring;
- uptime monitoring;
- backup and restore drills;
- operational audit documentation.

---

# R10 — Product Polish & Expansion

Status: PLANNED

Goal:

Turn the authenticated and administered application into a polished release.

Candidate work:

- Ukrainian / Russian / English interface architecture;
- move display strings out of domain values;
- PWA manifest and installability;
- application icons;
- mobile/touch review;
- accessibility review;
- responsive regression;
- error-state review;
- performance review;
- dependency/security review;
- release checklist;
- richer reading analytics;
- recommendation features where useful.

Comic content remains externally hosted; Comic Diary continues to store catalog
metadata and personal reader data rather than comic pages.

---
# Future / Pro Ideas

These ideas are intentionally outside the initial R0-R12 delivery contract.

Possible future features:

- richer private diary entries;
- external/private diary content without hosting comic pages;
- additional reading analytics;
- richer statistics;
- additional catalog sources;
- administrative content tools;
- import automation;
- recommendation features.

They should not expand current milestones unless explicitly promoted into the roadmap.

---

# Roadmap Rules

1. This file is the canonical roadmap.
2. Completed milestones should not be silently rewritten.
3. Planned milestone scope may be refined before implementation begins.
4. Significant scope changes should be committed together with this document.
5. Development-only shortcuts must be removed before production release.
6. Each milestone should finish with:
   - lint;
   - typecheck;
   - production build;
   - Docker build where applicable;
   - local functional validation;
   - Git commit;
   - push;
   - green CI.


# Comic Diary Product Direction — CD Workstream

Canonical product specification: [docs/product-spec.md](docs/product-spec.md).
The MyShows-inspired daily reader workflow adds CD-* milestones without
renaming or deleting historical R8/R9 and UI-F* work.

## CD-00 — Baseline Acceptance
Status: IN PROGRESS

Confirmed HEAD 6aa6199 was pushed. Windows typecheck/lint/webpack build,
migration 0016 and actual PostgreSQL chapter-reading probe passed.
Legacy title desktop screenshot preserves 7/12, ratings and note.
Registered chapter desktop/mobile visual acceptance remains pending.

## CD-01 — Responsive Navigation
Status: IN PROGRESS

Implementation: four destinations (Updates, Library, Catalog, Profile), mobile
bottom navigation, safe-area content padding and desktop navigation.
Catalog remains at / to preserve existing links. /updates is a separate route;
automatic homepage/login default changes and navigation count badges are deferred.
Local typecheck/lint/webpack production build passed. Windows build and
responsive visual acceptance pending.

## CD-02 — Reading Updates
Status: IN PROGRESS

Implementation: /updates lists unread released chapters grouped by owned-library
titles, READING + MAIN defaults, status/kind/title filters, 20-title pages,
30-chapter lazy pages, source links, read-through counts and direct read actions.
Revision ancestry includes earlier read versions; specials remain separate.
Single read undo, load/save/error/empty/missing-registry states are provided.
No migration or fabricated release dates. Local PostgreSQL-compatible integration
probe passed for filters/counts, title/chapter pagination, revision ancestry and
private access. Browser and actual Windows PostgreSQL acceptance pending.

## CD-03–CD-11 — Planned Product Delivery
Status: PLANNED

- CD-03: compact library and explicit removal/diary policy.
- CD-04: catalog/title composition and release/type metadata.
- CD-05: administration, chapter input/import and cover save integrity.
- CD-06: profile/settings/export; event model before activity heatmaps.
- CD-07: release checks, deployment, backups and restoration.
- CD-08: source synchronization and reliable release calendar.
- CD-09: chapter pages, ratings/discussions and moderation.
- CD-10: opt-in social profiles, following, feed and achievements.
- CD-11: Android after stable web domain and API contract.

See the specification for dependencies, acceptance criteria and open decisions.


## CD Navigation Checkpoint — Account Workspace Entry

Windows CD-01/CD-02 typecheck/lint/webpack build and actual PostgreSQL probe
passed; committed and pushed as fdb214a. Desktop empty-registry Updates screenshot
reviewed. Registered chapter and mobile visual acceptance still pending.

Account page provides a server-rendered workspace link for EDIT_SHARED_CATALOG
permission holders (current ADMIN and EDITOR roles). USER sees no workspace card.
Existing /admin and mutation authorization remain authoritative. The account
page uses the existing shell main/container instead of nesting another main.


## CD-03 — Compact Library (first delivery)
Status: IN PROGRESS

Compact single-column title rows with portrait covers, personal status, main and
special progress and rating. Native keyboard-accessible disclosure retains full
progress, revision counts and personal note. Title search combines with status
and sort; status links preserve the search. Empty search and empty status states
are distinct. Private-title creation is collapsed by default.
No diary deletion or subscription mutation is included. Separating tracking
from diary data remains a required follow-up before removal can be offered.
Registered chapter desktop screenshots reviewed: arbitrary display codes,
MAIN/SPECIAL separation and 1/2 main + 0/1 special progress are visible.
Updates populated/mobile acceptance remains pending.

Release scheduling is specified for CD-05 input and CD-08 server processing:
explicit planned date/time/timezone plus opt-in automatic publication; date
alone never changes state. Archive/manual override cancels automatic action.
Replacement archives the predecessor only when the replacement is published.


## CD-03 — Confirmed Completion
Status: IN PROGRESS

Windows compact library checks passed; committed/pushed as 324460f. Desktop
collapsed/expanded legacy row reviewed: 7/12, rating and note preserved.
Confirmed COMPLETED now requires explicit MAIN/ALL scope; cancellation preserves
state. Completion adds missing RELEASED marks and status in one transaction
under catalog/library locks. Scheduled/archive records excluded, old mark dates
and diary preserved. Registry snapshot mismatch rejects a stale confirmation.
Legacy known total sets the counter only; unknown total preserves the counter.
Direct set-status COMPLETED is rejected. Return to READING preserves reads.
Local typecheck/lint/webpack build and PostgreSQL-compatible integration checks
passed. Actual Windows PostgreSQL and dialog/mobile visual acceptance pending.
Safe unsubscription remains outstanding.


## CD-03/CD-04 — Registry Counts and Independent Tracking
Status: IN PROGRESS

Confirmed completion committed and pushed as f90bb2b; Windows typecheck/lint/
webpack build and actual PostgreSQL completion probe passed. Desktop legacy
dialog and cancellation screenshots reviewed.

Delivery 1: available MAIN/SPECIAL counts derive only from RELEASED registry
records; totalChapters is descriptive metadata, never a progress denominator.
Empty registry shows zero available records and retains legacy personal count
without percentage. Completion without registry changes status only, never
raises the old counter to a declared total. Existing diary data is preserved.

Delivery 2 (CD-03): tracking opt-in independent of personal reading status.
Unsubscribe preserves marks, ratings and notes. Tracked titles with any reading
status are eligible for updates; READING remains a filter, not subscription.
Delivery 3 (CD-04): explicit publication state ONGOING/FINISHED/HIATUS/
CANCELLED/UNKNOWN, separate from catalog visibility and reader status.
Caught up on an ongoing title remains READING; a new chapter restores unread
state. FINISHED plus completed MAIN reading permits explicit completion,
with specials chosen separately. Existing unknown-state titles need an honest
compatibility path, not inferred publication state from declared chapter count.
Delivery 4 (CD-08): notification delivery for newly published chapters and
revisions of tracked titles, plus release calendar. Updates list is already
available; push/email notifications are not implemented.

CD-03 remains IN PROGRESS until independent tracking and safe unsubscribe
are delivered and accepted; CD-04 publication metadata is still planned.


## CD-03 — Independent tracking and safe unsubscribe (2026-10-09)

Implementation ready; Windows PostgreSQL validation and desktop/mobile visual acceptance pending.

- `user_comics.tracking_enabled` is independent of personal reading status and publication state. Migration 0017 defaults existing and new library entries to true, preserving tracking.
- Disabling tracking retains the library row, chapter marks/read dates, ratings, notes, personal status and reading dates. It excludes the title from both updates title queries and chapter expansion. Re-enabling exposes currently unread released chapters; nothing is auto-read.
- The old `remove-from-library` intent is a compatibility alias for disabling tracking, never diary deletion. Shared and owned private titles support the same toggle. Ownership and session/origin checks remain mandatory.
- Library cards and comic details offer explicit “Включить/Отключить обновления”; disabled titles stay visible with a badge. Default updates filters are ALL statuses and ALL chapter kinds so completed titles, extras and revisions remain discoverable; optional filters only narrow the view.
- This delivers in-app updates. Push/email notification delivery and scheduled chapter publication remain CD-08. Publication state ONGOING/FINISHED/HIATUS/CANCELLED/UNKNOWN and publication-aware completion remain CD-04; COMPLETED must not be inferred from caught-up counts.
- CD-03 remains IN PROGRESS until registered completion, safe unsubscribe and mobile visual acceptance are complete. Next: CD-04 publication metadata and honest ongoing/finished reading semantics.


## CD-04 — Publication state and available-only reading (2026-10-09)

Status: IN PROGRESS. Publication state implementation ready; Windows PostgreSQL and desktop/mobile acceptance pending. Tracking was accepted by the operator after d7e2e93; global UI terminology review is deferred.

- `comics.series_status`: UNKNOWN / ONGOING / FINISHED / HIATUS / CANCELLED. This describes the release of the work, independent of catalog visibility (`publication_status`) and personal reading status. Migration 0018 assigns UNKNOWN to existing titles. Neither declared totals nor 100% available reading imply FINISHED.
- Shared catalog editors and private owners edit the state in existing metadata forms. Invalid values are rejected. Older catalog imports and metadata clients omitting the field preserve an existing state; new records use UNKNOWN. Metadata changes never rewrite personal status, chapter reads, tracking, ratings or notes.
- “Отметить всё вышедшее” confirms MAIN versus ALL (including specials), marks only current RELEASED registry entries, and explicitly sets personal READING. It retains tracking and read dates; scheduled and archived chapters are excluded. Caught-up is computed, not a new persistent personal status. ONGOING caught-up reads “Всё вышедшее прочитано · Жду продолжения”.
- COMPLETED requires explicit confirmation and FINISHED publication state. Registered titles with SCHEDULED MAIN chapters or no RELEASED MAIN chapters cannot complete. FINISHED with no registry may explicitly finish the personal diary without modifying its legacy counter; the UI says chapter identities are unavailable. Scheduled specials remain unmarked. Existing historical COMPLETED entries are preserved, even when publication state remains UNKNOWN.
- Completion snapshots include publication state. The transaction locks catalog and library records; stale chapter or publication snapshots are rejected before marks are inserted. Optional completion of MAIN never clears existing special marks.
- Late releases, specials and revisions remain visible for tracked completed titles. Actual push/email delivery and automatic release on dates remain CD-08.
- This slice does not complete all CD-04 catalog work: remaining search/filter/catalog acceptance and the global wording pass retain their roadmap scope. Verify all five publication labels, MAIN/ALL dialogs, cancellation, stale snapshots, legacy counters, ownership and narrow-screen layout before closing the slice.
