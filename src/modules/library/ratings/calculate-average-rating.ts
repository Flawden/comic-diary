export type PersonalRatings = {
  ratingPlot: number | null;
  ratingCharacters: number | null;
  ratingArt: number | null;
  ratingDepth: number | null;
  ratingWorld: number | null;
};

export function calculateAverageRating(
  ratings: PersonalRatings,
): number | null {
  const values = [
    ratings.ratingPlot,
    ratings.ratingCharacters,
    ratings.ratingArt,
    ratings.ratingDepth,
    ratings.ratingWorld,
  ].filter(
    (value): value is number =>
      value !== null,
  );

  if (values.length === 0) {
    return null;
  }

  const total = values.reduce(
    (sum, value) => sum + value,
    0,
  );

  return total / values.length;
}
