import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRating, formatRatingVotes } from "./community-rating";
import { calculateAverageRating } from "./calculate-average-rating";

test("empty ratings remain null and never render zero out of five", () => {
  assert.equal(calculateAverageRating({ ratingPlot: null, ratingCharacters: null, ratingArt: null, ratingDepth: null, ratingWorld: null }), null);
  assert.equal(formatRating(null), "Пока нет оценок");
});
test("partial personal means retain precision; equal-reader example is three", () => {
  const a = calculateAverageRating({ ratingPlot: 5, ratingCharacters: 5, ratingArt: 5, ratingDepth: 5, ratingWorld: 5 })!;
  const b = calculateAverageRating({ ratingPlot: 1, ratingCharacters: null, ratingArt: null, ratingDepth: null, ratingWorld: null })!;
  assert.equal((a + b) / 2, 3);
  assert.equal(calculateAverageRating({ ratingPlot: 5, ratingCharacters: 5, ratingArt: 4, ratingDepth: null, ratingWorld: null }), 14 / 3);
});
test("Russian display rounds only at presentation", () => {
  assert.equal(formatRating(4.949), "4,9 / 5"); assert.equal(formatRating(4.95), "5,0 / 5");
  assert.equal(formatRating(1), "1,0 / 5"); assert.equal(formatRating(5), "5,0 / 5");
});
test("Russian voter and score plurals", () => {
  for (const [n, expected] of [[0, "0 оценок"], [1, "1 оценка"], [2, "2 оценки"], [11, "11 оценок"], [21, "21 оценка"], [22, "22 оценки"]] as const) assert.equal(formatRatingVotes(n), expected);
  assert.equal(formatRatingVotes(1, true), "1 читатель оценил");
  assert.equal(formatRatingVotes(2, true), "2 читателя оценили");
  assert.equal(formatRatingVotes(5, true), "5 читателей оценили");
});
