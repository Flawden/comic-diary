import { WorkIcon } from "@/shared/components/WorkIcon";
import { readingMeasures, chapterCountLabel, type ChapterMeasure } from "@/modules/catalog/work-presentation-policy";
import { formatRating, formatRatingVotes, type RatingAggregate } from "../ratings/community-rating";

export function ChapterGroupSummary({ title, chapters, read, canMark, rating, headingAs = "span", showProgress = true }: {
  title: string;
  chapters: readonly ChapterMeasure[];
  read: ReadonlySet<number>;
  canMark: boolean;
  rating?: RatingAggregate | null;
  headingAs?: "h2" | "span";
  showProgress?: boolean;
}) {
  const measures = readingMeasures(chapters, read);
  const scheduled = chapters.filter(chapter => chapter.kind === "MAIN" && chapter.status === "SCHEDULED").length;
  const Heading = headingAs;
  return <>
    <Heading className="wd-volume-heading">{title}</Heading>
    <span className="wd-volume-measures">
      <span><WorkIcon name="book"/>{chapterCountLabel(measures.totalChapters)}</span>
      {scheduled > 0 && <span>Ожидается: {scheduled}</span>}
      {measures.totalPages !== null && <span><WorkIcon name="pages"/>{measures.totalPages} стр.</span>}
      {measures.minutes !== null && <span><WorkIcon name="clock"/>≈ {measures.minutes} мин</span>}
    </span>
    {canMark && measures.totalChapters > 0 && <span className="wd-volume-progress">
      <span><WorkIcon name="book"/>{showProgress ? `По главам: ${measures.chapterPercent}% (${measures.readChapters} из ${measures.totalChapters})` : `Прочитано глав: ${measures.readChapters} из ${measures.totalChapters}`}</span>
      {showProgress && <progress aria-label={`Прогресс: ${title}`} max={measures.totalChapters} value={measures.readChapters}/>}
    </span>}
    {canMark && measures.totalPages !== null && <span className="wd-volume-progress">
      <span><WorkIcon name="pages"/>Страницы прочитанных глав: {measures.readPages} из {measures.totalPages}</span>
    </span>}
    {measures.totalPages === null && measures.knownPageChapters > 0 && <small className="wd-volume-incomplete">
      Страницы заполнены для {measures.knownPageChapters} из {measures.totalChapters} глав
    </small>}
    <span className="wd-volume-rating" aria-label={`Рейтинг по оценкам глав: ${rating?.average == null ? "оценок пока нет" : formatRating(rating.average)}`}>
      <strong><WorkIcon name="star"/>{formatRating(rating?.average ?? null)}</strong>
      <small>По оценкам глав</small>
      <small>{rating?.votes ? formatRatingVotes(rating.votes, true) : "—"}</small>
    </span>
  </>;
}
