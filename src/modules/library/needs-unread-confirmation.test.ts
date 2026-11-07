import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { needsUnreadConfirmation } from "./needs-unread-confirmation";

test("rated unread needs confirmation, including scores one through five", () => {
  for (const score of [1, 2, 3, 4, 5]) {
    assert.equal(needsUnreadConfirmation("unread", score), true);
  }
});

test("unrated and other actions do not require confirmation", () => {
  for (const rating of [undefined, null, 0, -1, 6, NaN]) {
    assert.equal(needsUnreadConfirmation("unread", rating), false);
  }
  assert.equal(needsUnreadConfirmation("read", 5), false);
  assert.equal(needsUnreadConfirmation("read-through", 4), false);
});

test("chapter toggle no longer depends on browser-native confirmations", () => {
  const source = readFileSync("src/modules/library/components/ChapterReadingPanel.tsx", "utf8");
  assert.doesNotMatch(source, /window\.confirm\s*\(/);
  assert.match(source, /<UnreadChapterConfirmation\b/);
});
