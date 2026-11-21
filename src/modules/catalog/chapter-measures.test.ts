import assert from 'node:assert/strict';
import test from 'node:test';
import { optionalChapterMeasure, expectedChapterMeasures } from './chapter-measures';
test('omitted metadata preserves values; null explicitly clears; positive bounded integers remain exact', () => {
  for (const value of [undefined, null, 1, 24, 100000]) assert.equal(optionalChapterMeasure(value), value);
});
test('metadata baseline is exact, complete and does not accept extra identity fields', () => {
  assert.equal(expectedChapterMeasures(undefined), undefined);
  assert.deepEqual(expectedChapterMeasures({pageCount:null,readingMinutes:3}),{pageCount:null,readingMinutes:3});
  for (const value of [null, [], {}, {pageCount:1}, {pageCount:0,readingMinutes:2}, {pageCount:1,readingMinutes:2,userId:1}]) assert.throws(() => expectedChapterMeasures(value));
});
test('zero, fractional, inferred strings, non-finite and out-of-range metadata fail closed', () => {
  for (const value of [0, -1, 1.5, '24', '', NaN, Infinity, 100001, {}, false]) assert.throws(() => optionalChapterMeasure(value));
});
