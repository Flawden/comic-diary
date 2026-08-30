# Comic Diary Catalog Input Format

This document defines the working intake format for real catalog metadata.

The canonical application dataset remains typed in `src/catalog/catalog-data.ts`.

For bulk preparation, XLSX is preferred. UTF-8 CSV is also accepted.

## One row per comic

Required columns:

- `categorySlug` — existing canonical category slug;
- `slug` — stable comic business key; lowercase Latin letters, digits and hyphens;
- `title` — displayed comic title;
- `sourceUrl` — approved external HTTP/HTTPS reading source;
- `publicationStatus` — `PUBLISHED`, `HIDDEN`, or `ARCHIVED`.

Optional columns:

- `description` — catalog description;
- `authorName` — author or credited author string;
- `translatorName` — translator or translation team;
- `translatorNote` — translator note shown on the comic detail page;
- `totalChapters` — positive integer when known; blank means unknown;
- `coverUrl` — cover image URL; blank means the application placeholder is used.

## Null and blank values

For optional metadata, an empty spreadsheet cell means `null` in the canonical dataset.

`totalChapters` must be either blank or a positive integer.

## Slugs

Canonical slugs must match:

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

A slug becomes a stable identifier after import and should not be changed casually.

When raw source material does not contain slugs, they may be generated during catalog preparation and then frozen.

## Publication lifecycle

- `PUBLISHED` — appears in the public catalog;
- `HIDDEN` — omitted from public catalog discovery but remains directly accessible and preserved in personal libraries;
- `ARCHIVED` — omitted from public catalog discovery but remains directly accessible and preserved in personal libraries.

## Cover strategy

A cover is not required for initial catalog import.

When `coverUrl` is blank, the current UI displays a placeholder.

Cover enrichment can therefore be performed independently from metadata migration.

## Recommended spreadsheet column order

```text
categorySlug
slug
title
description
authorName
translatorName
translatorNote
sourceUrl
totalChapters
coverUrl
publicationStatus
```

Before real data is added to the repository, every row must pass the canonical catalog validator.
