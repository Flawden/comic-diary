import { formatRating, formatRatingVotes, ratingCriteria, type CommunityRatings as Ratings } from "../ratings/community-rating";

export function CommunityRatings({ ratings }: { ratings: Ratings }) {
  return <section aria-labelledby="community-rating-heading" data-community-rating
    className="my-6 min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
    <h2 id="community-rating-heading" className="text-xl font-semibold">Рейтинг читателей</h2>
    <p className="mt-2 text-lg font-semibold" data-community-overall>{formatRating(ratings.overall.average)}</p>
    <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatRatingVotes(ratings.overall.votes, true)}</p>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {ratingCriteria.map(([key, label]) => <div key={key} className="min-w-0">
        <dt className="font-medium">{label}</dt>
        <dd className="mt-1 text-sm">{formatRating(ratings.criteria[key].average)}
          <span className="block text-[var(--text-secondary)]">{formatRatingVotes(ratings.criteria[key].votes)}</span>
        </dd>
      </div>)}
    </dl>
  </section>;
}
