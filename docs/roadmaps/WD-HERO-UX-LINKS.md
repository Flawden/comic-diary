# Comic Diary · WD HERO / Links roadmap

Updated: 2026-11-11. This document travels with the repository to survive chat handoffs.

## Goal

The work page hero presents the work itself (cover, identity, a single live reading progress indicator, concise description). The chapter list handles reading destinations. The canonical catalog supports works and published chapters without external URLs; a missing source never blocks tracking a chapter as read.

## Confirmed product rules

1. Direct chapter URL present: "Read chapter" opens that link.
2. Missing chapter URL and available shared work source: offer clearly labelled "Open general source". This is NOT a direct chapter link.
3. Neither URL: non-clickable notice "Ссылка на чтение пока не добавлена"; do not skip to the next linked chapter.
4. The general source remains discoverable in the chapter area even when all chapter URLs exist.
5. Scheduled chapters are not links and do not become readable merely because a URL exists. Archived chapters retain existing revision/read-history rules.
6. Hero never invents tags, a public aggregated star rating, or a personalized progress for guests.
7. No duplicate overall progress or description; preserve per-volume counters and unique About/translator information.
8. Preserve identities, read marks, ratings, rights, and VK import semantics.

## Source audit checkpoints

- A4.1 named volumes were in `master` at `d6eb8412d6c9145c9819ae5d93f600002c7341ea`.
- WD-HERO-00: 42 selected files exported read-only from that commit.
- WD-HERO-00B: 22 additional files exported read-only from the same commit.
- `chapters.source_url` already nullable; `comics.source_url` NOT NULL at the audited base.
- `reading-target.ts` already chooses the first unread released MAIN chapter and falls back to a work source; preserve editorial order.
- WD-EDGE-00 banner border patch is separate: branch `fix/wd-banner-edge-bleed`, commit `5c68aa97876b9be007338e86fe49ed34fe040024`, pushed. CI/PR/merge/visual check need confirmation.

## Work packages / gates

- **WD-EDGE-00**: one CSS file; CI + visual check, independent PR and merge. Do not mix with link schema migration.
- **WD-LINK-01**: this branch, `feature/wd-link-01-optional-work-source`, allows `NULL` in `comics.source_url`. Add migration `0029_optional_comic_source_url.sql`, update shared Comic Studio, API, canonical validator and VK DB-aware type; add tests. Historical URLs are never rewritten. Keep private-title flow unchanged until separately audited.
- **WD-LINK-02**: move source actions outside hero, align link states between chapter list and Continue Reading, explain unavailable URLs. Integration/regression tests for mixed linked/unlinked sequence.
- **WD-HERO-01**: hero layout, one client-owned/optimistic progress indicator, concise description, conditional real rating only; preserve About-only details.
- **WD-HERO-02**: mobile / guest / no chapters / long titles / no URLs / scheduled + archived / keyboard and screen reader QA.
- **WD-HERO-03**: CI, DB migration rehearsal on staging with existing data, backup/restore plan, PR, controlled deployment, smoke checks.

## Release safety

- Never migrate production or deploy automatically from an apply script.
- Migration must run **before** application code is allowed to write null comic URLs.
- CI clean DB migration is necessary but insufficient: rehearse migration against an existing staging DB / restored copy.
- No `git reset --hard`, force push, hidden data deletion, or unreviewed merge.
- Each stage leaves its own commit/PR, verification log and an updated copy of this roadmap.

## Remaining work / current checkpoint

WD-LINK-01 was applied locally on 2026-11-11 to `feature/wd-link-01-optional-work-source` from `d6eb841`; reviewed diff SHA-256 `af88e1becbb6fc4f180c38d542c7fac8f5b955ae6be67aea995cd712c0d9c093`, 13 files, offline tests 11/11. This branch still requires CI (lint, typecheck, build, disposable PostgreSQL) and a separate rehearsal of migration `0029` against an existing staging database before merge/deploy. No production database or deployment was touched by the apply step. After a chat handoff, check the Git branch, PR and CI status; do not reapply the patch.
