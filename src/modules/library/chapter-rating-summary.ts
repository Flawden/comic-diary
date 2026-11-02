type RatingState = {
  registry: readonly { id: number; kind: string; status: string }[];
  readIds: readonly number[];
  ratings: Record<number, number>;
};

export function chapterRatingSummary(state: RatingState, kind: "MAIN" | "SPECIAL") {
  const marks = new Set(state.readIds);
  let read = 0, rated = 0, sum = 0;
  for (const chapter of state.registry) {
    if (chapter.status !== "RELEASED" || chapter.kind !== kind || !marks.has(chapter.id)) continue;
    read++;
    const score = state.ratings[chapter.id];
    if (score === undefined) continue;
    rated++;
    sum += score;
  }
  return { read, rated, average: rated ? Math.round(sum * 10 / rated) / 10 : null };
}
