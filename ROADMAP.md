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

Status: IN PROGRESS

- show candidates, warnings, evidence, and existing catalog matches;
- allow editing, accepting, skipping, and postponing candidates;
- detect duplicate slugs and invalid metadata;
- preview create/update/unchanged decisions.

### R5.3.6 — Canonical Import

Status: PLANNED

- convert accepted candidates to the canonical catalog contract;
- run canonical validation and dry-run diff;
- reuse the idempotent catalog importer;
- preserve personal progress, ratings, and notes;
- avoid implicit destructive deletion.

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

# R6 — Catalog Discovery & UX

Status: PLANNED

Goal:

Make a larger catalog pleasant to browse.

Candidate capabilities:

- search by title;
- category filtering;
- sorting;
- improved catalog layout;
- useful empty states;
- responsive card grids;
- library/catalog visual consistency;
- better mobile navigation;
- potentially expose reading state directly in catalog cards.

Exact scope should be refined before implementation.

---

# R7 — Authentication & User Identity

Status: PLANNED

Goal:

Replace the development user identity with real authenticated users.

Planned direction:

- authentication;
- session handling;
- connect application requests to the authenticated user;
- remove DEV_USER_EMAIL from production paths;
- protect personal data;
- preserve the existing users and user_comics data model where practical.

Likely implementation candidate: Auth.js or an equivalent session-based solution.

Exact authentication provider and account model should be selected at the start of this stage.

---

# R8 — Internationalization

Status: PLANNED

Goal:

Make UI language independent from hard-coded Russian text.

Planned languages:

- Ukrainian;
- Russian;
- English.

Planned work:

- translation key structure;
- locale-aware routing or equivalent language strategy;
- migrate interface strings out of components;
- translated statuses and navigation;
- translated empty states and forms;
- define default locale before release.

The architecture should avoid coupling stored domain values to a display language.

---

# R9 — PWA & Mobile Experience

Status: PLANNED

Goal:

Make Comic Diary comfortable as an installable mobile application.

Planned work:

- web app manifest;
- application icons;
- installability;
- mobile layout review;
- touch-friendly interactions;
- basic offline/application-shell strategy where useful;
- PWA metadata;
- mobile browser testing.

Offline comic reading is not a goal because comic content remains hosted externally.

---

# R10 — Production Deployment

Status: PLANNED

Goal:

Run the application on a real server safely and repeatably.

Planned architecture:

Internet
-> HTTPS reverse proxy
-> Next.js application container
-> private Docker network
-> PostgreSQL

Planned work:

- production environment configuration;
- Caddy or equivalent reverse proxy;
- HTTPS;
- production Docker Compose;
- database not exposed publicly;
- persistent database storage;
- deployment procedure;
- production migration procedure;
- health verification.

---

# R11 — Reliability, Backup & Operations

Status: PLANNED

Goal:

Make production operation safe enough for real data.

Planned work:

- PostgreSQL backups;
- restore procedure;
- migration safety;
- application logging;
- container restart policy;
- health checks;
- deployment rollback strategy;
- data persistence verification;
- secret handling;
- operational documentation.

---

# R12 — Release Hardening

Status: PLANNED

Goal:

Turn the working project into a stable release candidate.

Planned work:

- full product regression;
- accessibility review;
- responsive UI review;
- error-state review;
- performance review;
- dependency review;
- security review;
- production configuration review;
- documentation cleanup;
- removal of development-only behavior;
- final release checklist.

R12 completes the initial product roadmap.

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
