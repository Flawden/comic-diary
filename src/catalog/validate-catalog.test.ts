import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalogData } from "./validate-catalog";
import type { CatalogComic } from "./catalog-data";

const categories = [{ slug: "tea-territory", name: "Tea Territory", description: null }];
const comic: CatalogComic = {
  slug: "optional-source-example",
  title: "Untethered comic",
  description: null,
  authorName: null,
  translatorName: null,
  translatorNote: null,
  coverUrl: null,
  sourceUrl: null,
  totalChapters: null,
  publicationStatus: "HIDDEN",
  categorySlug: "tea-territory",
};

test("a comic is valid without any source URL", () => {
  assert.doesNotThrow(() => validateCatalogData(categories, [comic]));
});

test("a valid HTTP(S) URL remains supported", () => {
  assert.doesNotThrow(() => validateCatalogData(categories, [{ ...comic, sourceUrl: "https://example.com/chapters" }]));
  assert.doesNotThrow(() => validateCatalogData(categories, [{ ...comic, sourceUrl: "http://example.com/chapters" }]));
});

test("blank strings and unsafe URL schemes are invalid canonical data", () => {
  for (const sourceUrl of ["", "  ", "javascript:alert(1)", "ftp://example.com", "/relative"]) {
    assert.throws(() => validateCatalogData(categories, [{ ...comic, sourceUrl }]));
  }
});
