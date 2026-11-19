import assert from "node:assert/strict";
import { test } from "node:test";
import { commentThreads } from "./thread-model";
import type { PublicComment } from "./policy";
const row = (id: number, parentId: number | null = null): PublicComment => ({ id, parentId, author: "Reader",
  mine: false, body: "Text", spoiler: false, status: "VISIBLE", createdAt: "2026-11-19T00:00:00.000Z", editedAt: null });
test("a late reply is immediately under its own root, before the next root", () => {
  assert.deepEqual(commentThreads([row(1), row(2), row(3, 1)]).map(t => [t.root.id, t.replies.map(r => r.id)]), [[1, [3]], [2, []]]);
});
test("pagination overlap and a replayed acknowledgement never duplicate replies", () => {
  assert.deepEqual(commentThreads([row(1), row(4, 1), row(3, 1), row(4, 1)]).map(t => t.replies.map(r => r.id)), [[3, 4]]);
});
test("hidden/deleted roots keep their replies; grouping never exposes or resurrects text", () => {
  const root = { ...row(1), body: null, status: "REMOVED_BY_AUTHOR" as const };
  const result = commentThreads([root, row(2, 1)]);
  assert.equal(result[0].root.body, null); assert.equal(result[0].replies[0].parentId, 1);
});
