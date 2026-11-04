import assert from "node:assert/strict";
import test from "node:test";
import { expectedReleasePrecision, formatExpectedRelease, formatReleasedAt, isValidExpectedRelease } from "./chapter-release-dates";

test("planned dates retain precision and validate Gregorian calendar", () => {
  for (const value of ["2026", "2026-11", "2026-11-04", "2028-02-29"]) assert.equal(isValidExpectedRelease(value), true);
  for (const value of ["", "2026-00", "2026-13", "2026-02-29", "2028-02-30", "2026-11-31", "2026-1", "2026-11-4", "2026-11-04T12:00:00Z"]) assert.equal(isValidExpectedRelease(value), false);
  assert.equal(expectedReleasePrecision("2026"), "YEAR");
  assert.equal(expectedReleasePrecision("2026-11"), "MONTH");
  assert.equal(expectedReleasePrecision("2026-11-04"), "DAY");
  assert.equal(expectedReleasePrecision(null), "NONE");
  assert.equal(formatExpectedRelease("2026"), "2026 г.");
  assert.equal(formatExpectedRelease("2026-11"), "ноябрь 2026 г.");
  assert.equal(formatExpectedRelease("2026-11-04"), "04.11.2026");
  assert.equal(formatReleasedAt("2026-11-04T12:00:00.000Z"), "04.11.2026");
});
