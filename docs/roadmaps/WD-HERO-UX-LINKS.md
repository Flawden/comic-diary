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


## WD-LINK-02 · Reading destinations (2026-11-11 checkpoint)

- Base: `4c572d4bb32596812ef9fa8e40d040d8a5186111` on `feature/wd-link-01-optional-work-source` (WD-LINK-01 CI reported green by the user). WD-LINK-01 database migration still not released.
- Work in isolated branch `feature/wd-link-02-reading-destinations` once the reviewed apply script is run.
- Remove the external-source CTA from the work hero; preserve the diary/shelf action.
- Put a persistent, accurately labelled common source action in the **chapters** tab only when a valid common URL exists.
- Per released chapter: direct URL wins, else show **general work source** (never falsely labelled as a direct chapter link), else nonclickable explanation. Scheduled/archived entries are never linked.
- Use the same HTTP(S), no-credentials URL safety helper used by reading targets; do not infer a URL or skip an unlinked chapter.
- Keep volume titles, read tracking, per-volume and overall progress unchanged in this stage. Description/hero progress redesign is reserved for WD-HERO-01.
- No database migrations, deployment, or merges from the apply script. Run all CI checks after human review/commit.
- Backup/restore tests were previously run on a test copy according to the user; avoid re-running infrastructure reconnaissance absent a specific new risk.


## WD-LINK-02 · Applied / CI handoff checkpoint (2026-11-11)

- Verified local apply on `feature/wd-link-02-reading-destinations` from parent `4c572d4bb32596812ef9fa8e40d040d8a5186111`; patch SHA-256 `d0f27b6382b5e67275978d0614c114f9d733abbeeb099aef3d93164719503208`; 5 changed files.
- Reading sources live in the chapters tab: direct chapter URL, clearly labelled general work source, or an explanation that no URL is available. Scheduled/archived chapters remain nonclickable; unlinked chapters are not skipped.
- WD-LINK-01 (`4c572d4`) CI was confirmed green by the user. The `0029` migration is not confirmed as deployed; do not merge or deploy this stacked branch independently of its parent.
- This checkpoint is being committed and pushed for full CI; CI outcome is **pending** until independently checked. No migration, server changes, PR merge, or deployment performed by the commit script.
- Prior backup restore tests on an isolated copy were confirmed by the user; further backup reconnaissance is out of scope of the UI work.
- Next product stage after CI: WD-HERO-01 — hero description and one client-owned reading progress widget, retaining per-volume progress and unique About content.


## WD-HERO-01 · Live progress and editorial hero · local apply checkpoint (2026-11-11)

- Audit source: Windows ZIP snapshot of the remote `feature/wd-link-02-reading-destinations` at `52f78565efc439c33d6cfb275fed9c25c347a6da` (user confirmed CI green). This stage must be a new branch stacked on WD-LINK-02, not a modification to the Windows `feature/catalog-redesign` checkout.
- Desktop hero uses three columns: cover, identity/actions/one live reading progress, and collapsible description. Responsive two-column then single-column layout preserves the existing background; the WD-EDGE-00 border fix remains a separate branch.
- A shared client `WorkChapterProgressProvider` owns React `useOptimistic` read IDs; chapter controls update it inside their existing transition, and hero reads the same state. `router.refresh()` reconciles with the server after success/failure.
- Only released MAIN chapters are counted in the hero. Scheduled, archival, and specials are excluded; per-volume counters and legacy manual progress form remain in their existing places. Guests and non-library users never see personal hero progress.
- About tab retains translator notes, author/translator metadata, work format, declared chapter count and private-title controls. Its duplicate story description is removed; full description remains expandable in the hero.
- Browser regression checks are updated for the new description placement and lack of duplicate chapter/diary progress. Full CI, visual and mobile QA remain gates before PR/merge/deploy.
- No DB migration, production changes, history rewriting, or deployment belongs to WD-HERO-01 apply.
