# Comic Diary

Comic Diary is a personal comic reading diary and catalog.

The application stores comic metadata and personal reading data, while comic pages remain on their approved external source.

## Current Status

Completed milestones:

- R0 — Product Concept
- R1 — Application Foundation
- R2 — Catalog Core
- R3 — Personal Library
- R4 — Ratings & Personal Notes

Current milestone:

- R5 — Real Catalog Data

See [ROADMAP.md](./ROADMAP.md) for the canonical project roadmap.

## Current Features

- comic catalog;
- comic detail pages;
- external reading links;
- personal reading library;
- reading statuses;
- chapter progress tracking;
- automatic reading-state transitions;
- personal library filters;
- clickable library statistics;
- PostgreSQL-backed home dashboard;
- Dockerized local environment;
- GitHub Actions CI.

## Technology Stack

- TypeScript
- React
- Next.js App Router
- Tailwind CSS
- PostgreSQL
- Drizzle ORM
- Docker
- Docker Compose
- GitHub Actions

The application is structured as a modular monolith.

## Requirements

- Node.js 22+
- npm
- Docker
- Docker Compose
- Git

Optional for direct database inspection:

- PostgreSQL psql client

## Local Environment

Create a local `.env` file in the repository root:

```env
POSTGRES_DB=comic_diary
POSTGRES_USER=comic_diary
POSTGRES_PASSWORD=comic_diary_dev
DATABASE_URL=postgresql://comic_diary:comic_diary_dev@localhost:5433/comic_diary
```

The `.env` file is intentionally not committed.

The development PostgreSQL container listens on container port 5432 and is exposed to the Windows host on port 5433.

The Dockerized application connects to PostgreSQL through the internal Docker network using `db:5432`.

## Start Local Development

From the repository root:

```powershell
npm run local
```

Open:

```text
http://localhost:3000
```

Stop the prepared local environment with:

```powershell
npm run local:stop
```

## Development Seed

Restore the repeatable development fixture with:

```powershell
npm run db:seed
```

The development fixture currently includes:

- category: `Чайная территория`;
- comic: `Тестовый комикс R2.3`;
- development reader: `reader@comic-diary.local`;
- reading status: `READING`;
- reading progress: `3 / 12`.

The application still uses a development reader identity. Real authentication is planned for R7.

## Useful Commands

Install dependencies:

```powershell
npm install
```

Run ESLint:

```powershell
npm run lint
```

Run TypeScript validation:

```powershell
npm run typecheck
```

Build the production application:

```powershell
npm run build
```

Build and start the Dockerized application:

```powershell
docker compose up -d --build app
```

Inspect containers:

```powershell
docker compose ps
```

Inspect application logs:

```powershell
docker compose logs app
```

## Application Routes

Home dashboard and catalog:

```text
/
```

Personal library:

```text
/library
```

Library status filters:

```text
/library?status=READING
/library?status=WANT_TO_READ
/library?status=COMPLETED
/library?status=ON_HOLD
```

Comic detail pages:

```text
/comics/<slug>
```

Development example:

```text
/comics/r2-3-test-comic
```

## Reading States

Supported reading statuses:

```text
WANT_TO_READ
READING
COMPLETED
ON_HOLD
```

Current progress behavior includes:

- progress cannot become negative;
- known chapter totals cap progress;
- advancing from WANT_TO_READ starts reading automatically;
- reaching the final known chapter marks the comic as COMPLETED;
- decreasing progress from COMPLETED returns it to READING.

## Project Structure

```text
src/
├ app/
│ ├ api/
│ ├ comics/
│ ├ library/
│ ├ layout.tsx
│ └ page.tsx
├ db/
├ modules/
│ ├ comics/
│ └ library/
└ shared/
  ├ components/
  └ config/
```

Database migrations are stored in `drizzle/`.

Development and utility scripts are stored in `scripts/`.

## Database

PostgreSQL is the persistent store and Drizzle ORM provides schema definitions, typed queries and migrations.

Important current tables:

- `categories`;
- `comics`;
- `users`;
- `user_comics`.

The `user_comics` table stores personal reading status, chapter progress and reading timestamps.

The personal diary layer includes five-dimensional ratings and personal notes.

## Continuous Integration

GitHub Actions validates pushed checkpoints with:

- dependency installation;
- ESLint;
- TypeScript typecheck;
- production application build;
- Docker image build.

A milestone is not considered complete until its pushed checkpoint passes CI.

## Production

Comic Diary is not production-ready yet.

Production deployment, authentication, backups, internationalization and PWA work are planned in later roadmap stages.

PostgreSQL must not be exposed publicly in production.

## Content Model

Comic Diary does not host comic pages.

The application stores catalog metadata and personal diary data, then links the reader to the approved external reading source.
