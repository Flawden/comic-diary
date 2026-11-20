import { formatRating, formatRatingVotes, ratingCriteria, type CommunityRatings as Ratings } from "../ratings/community-rating";
import "@/modules/community/community.css";

export function CommunityRatings({ ratings }: { ratings: Ratings }) {
  return <section aria-labelledby="community-rating-heading" data-community-rating
    className="reader-rating">
    <p className="community-kicker">Мнение читателей</p>
    <h2 id="community-rating-heading" className="community-heading">Рейтинг читателей</h2>
    <div className="reader-rating-overview"><div>
    <p className="reader-rating-score" data-community-overall>{formatRating(ratings.overall.average)}</p>
    <p className="reader-rating-votes">{formatRatingVotes(ratings.overall.votes, true)}</p>
    </div><dl className="reader-rating-criteria">
      {ratingCriteria.map(([key, label]) => <div key={key} className="min-w-0">
        <dt className="font-medium">{label}</dt>
        <dd className="mt-1 text-sm">{formatRating(ratings.criteria[key].average)}
          <span className="block text-[var(--text-secondary)]">{formatRatingVotes(ratings.criteria[key].votes)}</span>
        </dd>
      </div>)}
    </dl></div>
  </section>;
}
