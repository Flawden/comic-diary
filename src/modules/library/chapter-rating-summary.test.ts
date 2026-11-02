import assert from "node:assert/strict";
import test from "node:test";
import { chapterRatingSummary } from "./chapter-rating-summary";
const registry = [1,2,3,4,5,6,7].map(id => ({ id, kind:id===5?"SPECIAL":"MAIN", status:id===6?"ARCHIVED":"RELEASED" }));
const state = {registry, readIds:[1,2,3,4,5,6], ratings:{1:5,2:4,3:3,5:2,6:1,7:1}};
test("partial scores, separate specials, archived and unread excluded", () => {
  assert.deepEqual(chapterRatingSummary(state,"MAIN"),{read:4,rated:3,average:4});
  assert.deepEqual(chapterRatingSummary(state,"SPECIAL"),{read:1,rated:1,average:2});
});
test("editing and clearing scores leaves read count unchanged", () => {
  assert.equal(chapterRatingSummary({...state,ratings:{...state.ratings,3:5}},"MAIN").average,4.7);
  assert.deepEqual(chapterRatingSummary({...state,ratings:{}},"MAIN"),{read:4,rated:0,average:null});
});
