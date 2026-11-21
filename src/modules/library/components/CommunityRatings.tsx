import { formatRating, formatRatingVotes, ratingCriteria, type CommunityRatings as Ratings } from "../ratings/community-rating";
import "@/modules/community/community.css";
import { CategoryIcon } from "@/shared/components/RatingIcon";

export function CommunityRatings({ ratings, personalAverage=null,onEdit,loginHref,personalHidden=false,showPersonal=true }: { ratings: Ratings; personalAverage?:number|null; onEdit?:()=>void;loginHref?:string;personalHidden?:boolean;showPersonal?:boolean }) {
  return <section aria-labelledby="community-rating-heading" data-community-rating
    className={`reader-rating${showPersonal?'':' reader-rating--without-personal'}`}>
    <h2 id="community-rating-heading" className="sr-only">Рейтинг читателей</h2>
    <div className="reader-rating-overview"><div>
    <p className="reader-rating-label">Общая оценка читателей</p>
    <p className="reader-rating-score" data-community-overall aria-label={ratings.overall.average===null?'Оценок пока нет':undefined}><span aria-hidden="true">{ratings.overall.average===null?'':'★ '}</span>{formatRating(ratings.overall.average)}</p>
    <p className="reader-rating-votes">{ratings.overall.votes>0?formatRatingVotes(ratings.overall.votes, true):'—'}</p>
    </div><dl className="reader-rating-criteria">
      {ratingCriteria.map(([key, label],index) => <div key={key} className="min-w-0">
        <dt className="font-medium"><CategoryIcon index={index}/>{label}</dt>
        <dd className="mt-1 text-sm" aria-label={ratings.criteria[key].average===null?'Оценок пока нет':undefined}>{formatRating(ratings.criteria[key].average)}
        </dd>
      </div>)}
    </dl>{showPersonal&&<div className="reader-rating-personal"><span>Моя оценка</span><strong aria-label={personalAverage===null?'Публичной оценки пока нет':undefined}>{formatRating(personalAverage)}</strong><small>{personalHidden?'Отзыв скрыт':'Оценка публичного отзыва'}</small>
      {onEdit?<button type="button" disabled={personalHidden} aria-label="Редактировать мою оценку" onClick={onEdit}>✎</button>:loginHref?<a href={loginHref}>Войти</a>:null}
    </div>}</div>
  </section>;
}
