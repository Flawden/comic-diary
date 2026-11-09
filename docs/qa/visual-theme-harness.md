# Visual theme QA — isolated screenshot harness

This workflow is a **review aid**, not a replacement for accessibility, functional, or release acceptance testing.

- Trigger: push to `fix/qa-visual-harness` (and manual dispatch once the workflow is available on the default branch).
- Execution: `ubuntu-latest` with disposable PostgreSQL 17 database, Next.js on `127.0.0.1:3102`, and Chromium via the existing `playwright-core@1.56.1`/Chrome setup.
- Data: synthetic test account and two synthetic comics, with sessions and chapters written **only** to the disposable CI database. Screenshots intentionally contain a fake `@test.invalid` account and no real user content.
- Evidence: `visual-qa-<full commit SHA>` artifact on GitHub Actions. Download ZIP, extract, open `index.html` to inspect screenshots, or read `manifest.json` for route/viewport/theme findings.
- Coverage: `paper`, `night`, `tea` × `390×844` and `1440×900` × catalog, library, updates, profile, work reader, login, registration (42 screenshots), plus removal-confirmation dialogs (6 screenshots) = **48 expected PNGs**.
- Behavior checks: theme cookie, visible page, mobile catalog links hidden, small delete icon, delete confirmation opens and **cancels without removal**, no unexpected API write, theme selector survives reload, no page-wide horizontal overflow.
- Security: hard failure unless `CI=true`, `VISUAL_QA_MODE=isolated-ci`, PostgreSQL host/user/database exactly match the test contract, and app base URL stays hardcoded to localhost. External browser requests are blocked. No production server or real user database access.
- CI still needs human visual review; a green result means required routes rendered and screenshots were collected, **not** that every color or pixel is approved.
- If the screenshot step fails, the workflow still attempts to publish the accumulated evidence (`if: always()`) so the issue can be inspected.

## From Termux

After the feature branch is committed/pushed, check the new workflow in GitHub Actions or use:

```bash
gh run list -R Flawden/comic-diary --workflow 'Visual theme QA (isolated)' --limit 5
```

To download the evidence for a completed run (substitute its ID):

```bash
gh run download RUN_ID -R Flawden/comic-diary -n visual-qa-FULL_COMMIT_SHA -D "$HOME/storage/downloads/ComicDiary-Visual-QA"
```

Do not merge this workflow or its visual fixes into production without reviewing the screenshots and running normal CI first.
