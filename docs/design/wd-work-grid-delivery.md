# WD06 — compact work overview and shelf grid

Baseline: WD05 commit da91060; operator output confirms CI 40987179456 including production deployment. Mobile screenshots confirm WD05 header, progress disclosure and journal summary alignment.

Work overview: main released chapter count, reference total, publication series status and known type/format now sit with the title next to the cover on mobile. Unknown type/format no longer emits an empty grid item. Credit and description disclosures keep 44px targets. Actions wrap with a full-width external reading link on mobile. Titles and metadata wrap without truncation.

Shelf grid: smaller typography and spacing, consistent cover ratio, empty rating row removed, shorter note and revision signals, compact details. Special and updated chapter counts now occupy distinct paragraphs. Grid remains two columns on mobile and three on desktop; a single book intentionally leaves remaining columns empty. List presentation retains its structure with clearer details signals.

All queries, chapter semantics, source URL, tracking controls, status mutations, ratings and permissions remain unchanged. Theme tokens are reused.

Validation: TypeScript, ESLint, webpack production build with build-only DATABASE_URL; installer application and repeat application on disposable Git baseline. Live database and browser visual acceptance are not claimed. Production CI pending. Review paper/tea/night, 320/360/390/768/1440 widths, enlarged text, long titles, no cover, unknown metadata, empty/populated shelf, details with long notes and tracking controls. This delivery does not complete the full design roadmap.
