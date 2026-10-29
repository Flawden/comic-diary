# WD-03 mobile polish — 2026-10-29

Operator confirmed WD02 CI success, ratings save/clear/reload and chapter marking persistence. Screenshots confirmed the deployed compact chapter list and shelf.

This increment reduces catalog cards to linked covers/titles, metadata and a short personal progress line, removing the redundant detail link and description preview. The complete description remains in the comic detail. Ratings use outline empty stars and amber selected stars, keep native radio groups, accessible names and explicit save. Narrow containers retain labels above stars; wider containers use one row per criterion. Chapter search and section controls are in a disclosure whose summary always shows the selected section, search indicator and result count; a reset action clears both filters. Chapter ordering and all mutation endpoints are unchanged.

Local checks: TypeScript, ESLint and webpack production build. Installer checks exact WD02 baseline hashes, clean worktree, creates a backup, and does not commit/push. Browser visual acceptance and production CI remain required for this increment. No database migration, seed or new permission.

Acceptance: check paper/tea/night, mobile and desktop, long catalog titles, five rating values and clearing, keyboard focus, chapter section/search/reset, and reading marks. No roadmap stage is declared fully complete by this increment.
