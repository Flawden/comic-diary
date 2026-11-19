# AUTH + RATE + COMMUNITY integration (2026-11-19)

The visual baseline is the actual deployed commit
`a5119b2d599fc9d9915e7bfeb71d6ba2b26f5f57`. The public readiness endpoint and
`git ls-remote origin refs/heads/master` independently returned this SHA.
No production SQL, deployment, remote write or real provider call was performed.

The new worktree starts at accepted AUTH checkpoint
`a181412ea580adfb983a1cfea769bd821804d440`, which contains the complete deployed
history. RATE implementation `8ba39b920ffe05dddc3dc659a116ce3bb19460b2` and
COMMUNITY checkpoint `23b8c18c3a55828fb8c05824bef4471069bddb97` were imported by
explicit file selection and adapted to the live UI. No merge, rebase, cherry-pick,
reset or changes to the source worktrees were used.

## Visual preservation

The existing catalog dragon artwork, fonts, themes, dashboard, Comic Studio,
description modal, shared optimistic chapter progress, named volumes and chapter
artwork remain the baseline. Protected source/assets are compared with deployed
Git blobs in `.qa/visual-preservation.json` (83 files identical after CRLF
normalization). Three existing UI files receive additive integration:

- Work page: one rating summary after the hero and one work discussion; retains
  current hero/progress provider, description modal, chapter covers and volume titles.
- Chapter panel: summary and discussion button inside the current illustrated row;
  one selected discussion below the list. Existing reading/volume controls remain.
- Admin shell: permission-gated moderation link in the current management section.

Public comments use existing theme variables. No global CSS, palette, font,
catalog layout, Comic Studio form or illustration was replaced by an older file.
Synthetic demo covers are fixture data, not a redesign of production content.

## Migration lineage

Live migrations 0000-0030 and accepted AUTH migrations 0031-0044 are unchanged.
Community is now additive `0045_community_comments`, four tables only; the old
COMMUNITY 0028 migration is not copied into this lineage.

The AUTH history had no schema snapshots after 0027. Automatic generation would
therefore also propose already-existing AUTH DDL. The 0045 SQL deliberately
contains only the four new community tables and their constraints/indexes; its
new complete snapshot describes the actual end schema. Historical snapshots,
0044 and migration journal entries through 0044 remain unchanged. Repeat Drizzle
generation reports no changes. Actual metadata and a populated 0030 upgrade are
verified separately on PostgreSQL 17 and 18.

Apply only after independent review, remote CI and an approved backup/migration
plan. No automatic destructive rollback of tables containing user content.

## AUTH boundary and community authorization

AUTH runtime modules and its start/fence/reservation/finalization policy remain
unchanged. Sending stays disabled without explicit configuration, verified sender
and real server credentials. Local QA blocks unmocked outbound HTTP; all Resend
outcomes are mocked. There are no real credentials in the worktree or review ZIP.

COMMUNITY now reuses `canUseFullAccountSession` inside its locked transaction,
including verification state after a lock wait. Pending activation cannot publish
or moderate using a previously issued session. AUTH's existing legacy-account
policy is preserved. Two new PostgreSQL tests cover pending activation and its
concurrent revocation. Public reading remains available to guests.

All other comment invariants remain: target privacy, tombstone body removal,
one-level replies, author-scoped create UUID/digest, shared transactional quotas,
ADMIN_SECURITY, audit, strict Origin and bounded body handling. Refreshing RSC
revalidates visibility without remounting a new-comment draft.

## Local verification and handoff

Evidence is in ignored `.qa/`: 261 source unit, 348 contracts; on EACH PG17/18,
59 AUTH mock dispatch + 8 RATE + 26 COMMUNITY integration tests. The existing
reading/catalog/account probes are also rerun. Browser QA covers three themes,
320/1440, actual saves/moderation, real password login, live hero reading progress,
current dashboard/wizard and recovery OFF. Full results are in REPORT.md.

The original worktrees, AUTH checkpoint, old RATE/COMMUNITY commits and two user
UI edits remain untouched. Local integration is not independent acceptance or a
production release. Stop for owner review after the integrated demo and package.
