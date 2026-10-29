# WD-02 — compact reader delivery, 2026-10-29

Previous delivery CI 40868086459: Verify, PostgreSQL release checks, Windows client, publish and production deploy passed according to operator logs. Mobile screenshots show deployed UI; they do not close persistence or final visual acceptance.

This delivery reduces shelf metadata density, moves special/revision details into disclosure, preserves title/cover links, replaces chapter cards with compact rows and accessible mark buttons, and exposes rating/note editing by default. Five native radio groups retain existing rating field names and null clearing. Draft average updates in the client; stored average is explicitly labelled separately. Save still uses existing update-diary POST. No automatic save is claimed.

Work identity has one mobile title/category block; credits and description can be expanded. Profile chapter counts are compact rows. Missing covers have a labelled fallback; pending loads have visible loading text. Theme cookies, ownership predicates, routes, DB mutations, chapter ordering, revision history and backup configuration are unchanged. No migration or seed.

Validation: typecheck, ESLint and production webpack build passed with a build-only DATABASE_URL. Actual component SSR with fixture data and mocked Next navigation verified 30 radio options, five persisted checked ratings, accessible labels, chapter read/unread fields and comic identity. Installer is checked separately on a disposable Git tree. Browser execution could not start: Chromium download was corrupt. Browser layout, keyboard interaction, cover network states, real HTTP persistence, CI DB regressions and production acceptance remain open.

Acceptance on 320/360/390/768/1440 widths and paper/night/tea: long titles/codes, list/grid, empty and reading diary, source links, special/archive/revision chapters, toggling marks, filtering and bulk forms, keyboard radio selection/clear, notes/save/reload, profile counts, no horizontal overflow. Check for updated stars without claiming data saved before submit. Whole-page authenticated flow and screenshot comparison required before closing WD stages.

Next: measured visual refinement, catalog/collection progress and verified next-chapter selection. Calendar/payment/history model are not part of this patch.
