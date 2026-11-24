export type RatingAggregate = { average: number | null; votes: number };
export const ratingCriteria = [
  ["plot", "Сюжет"], ["characters", "Персонажи"], ["art", "Рисовка"],
  ["depth", "Глубина"], ["world", "Мир"],
] as const;
export type CommunityRatings = {
  overall: RatingAggregate;
  criteria: Record<(typeof ratingCriteria)[number][0], RatingAggregate>;
  chapters: Record<number, RatingAggregate>;
  volumes?: Record<number, RatingAggregate>;
  unassignedChapters?: RatingAggregate;
  viewerChapters?: Record<number, {rating:number|null;source:'review'|'diary'|'withdrawn';hidden:boolean}>;
};

export function formatRating(average: number | null): string {
  return average === null ? "—" :
    `${average.toLocaleString("ru", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5`;
}

export function formatRatingVotes(votes: number, readers = false): string {
  const form = new Intl.PluralRules("ru").select(votes) as "one" | "few" | "many" | "other";
  const word = readers
    ? ({ one: "читатель оценил", few: "читателя оценили", many: "читателей оценили", other: "читателей оценили" })[form]
    : ({ one: "оценка", few: "оценки", many: "оценок", other: "оценок" })[form];
  return `${votes.toLocaleString("ru")} ${word}`;
}
