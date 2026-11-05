import assert from "node:assert/strict";
import test from "node:test";
import { isWorkType, isWorkFormat, workTypeLabels, workFormatLabels } from "./work-metadata";

test("WD19: graphic novel is a distinct, selectable work type", () => {
  assert.equal(workTypeLabels.GRAPHIC_NOVEL, "Графический роман");
  assert.equal(isWorkType("GRAPHIC_NOVEL"), true);
  assert.equal(isWorkType("GRAPHIC_NOVEL "), false);
  assert.equal(isWorkType("toString"), false);
  assert.equal(isWorkType("__proto__"), false);
});

test("WD19: existing types and independent formats remain available", () => {
  for (const type of ["UNKNOWN", "MANGA", "MANHWA", "MANHUA", "COMIC", "OTHER"]) {
    assert.equal(isWorkType(type), true, `legacy type missing: ${type}`);
  }
  for (const format of Object.keys(workFormatLabels)) {
    assert.equal(isWorkFormat(format), true, `format missing: ${format}`);
  }
  assert.equal(isWorkFormat("GRAPHIC_NOVEL"), false, "graphic novel is a type, not a format");
  assert.equal(isWorkType("PAGED"), false, "paged is a format, not a type");
});
