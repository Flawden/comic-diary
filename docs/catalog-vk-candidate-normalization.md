# VK Candidate Normalization Contract

## Purpose

R5.3.4 converts the reviewed VK raw snapshot into deterministic review
candidates.

Candidate generation is read-only. It does not contact VK and does not mutate
the canonical catalog or PostgreSQL.

## Candidate identity

One current positive-ID VK album produces one primary candidate.

Wall title signals do not automatically create canonical comic candidates.

Historical album references do not automatically create canonical comic
candidates.

This keeps noisy wall parsing separate from current source identity.

## Canonical draft

Each candidate contains a canonicalDraft with the Comic Diary intake fields.

Automatically proposed:

- categorySlug from explicit pipeline configuration;
- slug from deterministic transliteration of the proposed title;
- title from the current VK album display title;
- sourceUrl from the current VK album URL.

Not automatically invented:

- authorName;
- translatorName;
- translatorNote;
- totalChapters;
- publicationStatus.

Canonical description is null unless non-structured album-description text
exists and is preserved for review.

## Translation metadata

The normalizer extracts:

- raw translation status;
- normalized translation-status class;
- age rating.

Translation status is source workflow evidence only.

It must never be automatically mapped to Comic Diary publicationStatus.

## Chapter count

VK album photoCount is source page/photo evidence.

It must never be mapped to totalChapters.

## Cover evidence

Signed VK cover URLs may expire.

They remain source evidence and are not copied into canonical coverUrl.

## Wall evidence

A conservative comparison key normalizes:

- case;
- whitespace;
- decorative punctuation;
- underscores and punctuation separators;
- Russian ё/e equivalence.

It does not perform spelling correction, morphology, semantic matching, or
alias identity inference.

Direct title evidence and album-ID co-occurrence evidence are stored
separately.

Album-ID co-occurrence never confirms identity.

## External source links

Community links are attached only when the Russian-side link title has the
same conservative comparison key as the current album title.

The external link remains original-source evidence.

It does not replace the current VK album reading source automatically.

## Historical references

Historical references may be attached to a current candidate when their
observed title uses the same conservative comparison key.

identityConfirmed remains false.

Historical references with no current title match remain unresolved evidence.

## Unresolved evidence

The candidate set preserves three unresolved collections:

- wall title signals with no current album title match;
- community links with no current album title match;
- historical album references with no current album title match.

They are not silently promoted into comics.

## Human review boundary

Every generated candidate requires human review.

publicationStatus is intentionally left unset, so no candidate produced by
R5.3.4 is directly import-ready.

R5.3.5 owns editing, accepting, skipping, postponing, duplicate checks, and
canonical review decisions.

R5.3.6 owns conversion of accepted candidates into validated canonical import
data.
