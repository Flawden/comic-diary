# VK Raw Snapshot Contract

## Purpose

R5.3.3 introduces a versioned, read-only VK source snapshot.

The snapshot exists so candidate parsing and normalization can be developed
without repeatedly querying VK.

The snapshot is source evidence. It is not the canonical Comic Diary catalog
and it must never write directly to canonical catalog records.

## Current version

- snapshotKind: vk-catalog-source
- schemaVersion: 1

Consumers must validate both values before parsing.

## Source preservation

Album records preserve:

- VK album ID;
- the exact title returned by VK as rawTitle;
- a display helper as displayTitle;
- album description;
- photo/page count as photoCount;
- VK created/updated Unix timestamps;
- album source URL;
- signed cover URL as temporary source evidence.

photoCount must never be interpreted as totalChapters.

coverEvidenceUrl may expire and must not be treated as an immutable canonical
cover URL.

## Wall evidence

Raw wall text is deliberately excluded.

The snapshot preserves only derived evidence:

- observed title variants;
- normalized title keys;
- mention counts;
- first/last seen timestamps;
- hashtags;
- album ID co-occurrences;
- higher-signal singleton album ID co-occurrences;
- sample post IDs and source URLs.

Singleton title/album evidence does not prove identity.

Alias and canonical entity decisions belong to R5.3.4.

## Historical album references

A positive album ID observed on the wall but absent from the current album list
is recorded under historicalAlbumReferences.

Historical references preserve:

- VK album ID;
- source URL;
- first/last seen timestamps;
- mention count;
- sample post IDs and URLs;
- observed title evidence.

Historical references always use:

- currentAlbumPresent: false
- identityConfirmed: false

Source disappearance must never delete a canonical comic or personal reading
history.

## Credentials and privacy

Snapshots must never include:

- VK service/access tokens;
- admin secrets;
- authorization headers;
- raw VK error objects;
- raw wall post text.

The capture endpoint does not persist snapshots server-side.

The response is a downloadable JSON artifact.

## Reference snapshot

The first reviewed reference capture is tracked at:

    data/catalog-import/vk/raw/v1/comics_white_dragon-184058047-2026-08-30.json

The capture endpoint itself remains non-persistent. This repository copy is an
explicit reviewed fixture for deterministic R5.3.4 parser development.

Reference artifact:

- community ID: 184058047
- snapshot schema: 1
- reconciliation schema: 5
- SHA-256: a4b7da2856db1b560f0c8b4f30a236a1d57d2bccc7181aecc6823520e344fcfd

R5.3.4 may parse this fixture repeatedly without contacting VK.
## Canonical boundary

The R5.3 pipeline is:

    VK
    |
    v
    read-only discovery
    |
    v
    raw snapshot
    |
    v
    candidate normalization
    |
    v
    human review
    |
    v
    canonical validation
    |
    v
    dry-run
    |
    v
    idempotent import
    |
    v
    PostgreSQL

A raw snapshot must never mutate the canonical database.