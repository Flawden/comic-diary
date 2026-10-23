# White Dragon: first design slice

The library uses a warm paper background, forest-green accents, serif headings,
portrait covers and compact bookshelf rows. A persisted grid view is also available.
Mobile navigation remains visible at the bottom of the viewport.

## Implemented

- Shared header, navigation, focus styles and responsive library layout.
- Three coordinated themes: paper, night and tea. Existing preferences remain valid;
  paper is the default only when no valid preference exists.
- One status-tab row with counts, existing GET search and sorting.
- Diary notes and tracking controls inside expandable card details.
- Existing ownership, reading progress, specials, revisions and rating calculations
  are retained. The main action opens the existing work page.

## Validation

- TypeScript, ESLint and production build.
- Browser fixture checks at 1440, 768, 390 and 320 pixels, both views, persistence,
  all three themes after reload, expandable notes, tracking failure feedback and
  no JavaScript errors. Fixtures are not included in the application.
- Live authenticated library acceptance on desktop/mobile remains pending.

## Next slices

Work detail, updates, catalog and account need their own layout pass; this change
updates their shared shell and colors only. This is not a claim that the entire
redesign or CD-07 release acceptance is complete.

## Second slice — 2026-10-23

Implemented the reader layout across catalog, work detail, updates and account.
Catalog now starts with discovery; duplicate dashboard metrics were removed from
that page (they remain in library/account). Search and sorting stay visible;
metadata filters are disclosed and expand automatically when active. Native GET
parameters are retained. Covers and titles lead the catalog cards; unknown
metadata is omitted. Long titles have a three-line preview and a full work page.

The work page places the cover, identity and source link first, then personal
status/progress and full-width chapters. Ratings, notes, tracking and bulk chapter
marking are available through labeled disclosures. Anonymous visitors get a login
link before attempting to add a work. All reading mutations retain their existing
fields and endpoints. Source links are labeled generically, since not all sources
are VK. Private title edit/delete controls remain owner-only.

The account has identity, diary, appearance and expandable data/security settings.
Theme choices have small palette previews. Updates use the same heading and filter
layout. Shared primary button foregrounds were corrected across reader, auth,
import and admin screens. Admin headings and selected explanatory text were cleaned
up; the specialist import/editor workflows retain their existing layout.

### Validation and limits

- Production webpack build, TypeScript and ESLint.
- Browser checks of actual page markup with local fixture query results: four pages
  at 1440, 768, 390 and 320 pixels, no horizontal overflow or JavaScript errors.
- Three theme choices, account disclosures, native catalog filter field submission,
  chapter search, diary values, bulk chapter action/comic/chapter fields, and update
  load failure/retry visibility verified. Fixture routes are excluded from release.
- Visual review of desktop/mobile paper pages and the tea work page.
- An older source-text probe, `auth-library-read-identity-probe.ts`, fails its
  `addComicToUserLibrary` assertion identically on the supplied baseline and this
  version; it is not a passing gate claimed by this change. Query/mutation sources
  were not edited. Database release probes remain enforced by the existing CI.
- Live authenticated persistence, real production covers, private-title workflows
  and mobile-device acceptance still require the deployed application. Local
  browser fixtures do not establish those results.
