import { workTypeLabels, workFormatLabels } from "@/modules/comics/work-metadata";
import { seriesStatusLabels, caughtUpLabel } from "@/modules/comics/series-status";
import { TrackingControl } from "./TrackingControl";
import Link from "next/link";
import type { UserLibraryItem } from "@/modules/library/queries/get-user-library";
import { getLibraryProgressPercent } from "@/modules/library/library-view";
import { calculateAverageRating } from "@/modules/library/ratings/calculate-average-rating";
import { CoverImage } from "@/shared/components/media";

const statuses = {
  WANT_TO_READ: "В планах", READING: "Читаю", COMPLETED: "Прочитано", ON_HOLD: "На паузе",
} as const;

export function LibraryComicCard({ item, href }: { item: UserLibraryItem; href: string }) {
  const percent = item.chapterReading.registered ? getLibraryProgressPercent(item.currentChapter, item.progressCeiling) : null;
  const rating = calculateAverageRating(item);
  const note = item.personalNote?.trim();
  const metadata = [item.visibility === "PRIVATE" ? "Личное произведение" : item.categoryName,
    item.workType !== "UNKNOWN" ? workTypeLabels[item.workType] : null,
    item.workFormat !== "UNKNOWN" ? workFormatLabels[item.workFormat] : null].filter(Boolean);
  return <article id={`book-${item.comicId}`} className="shelf-book" aria-label={item.title}>
    <Link href={href} className="shelf-cover">
      <CoverImage src={item.coverUrl} alt={`Обложка ${item.title}`} className="shelf-cover-image" imageClassName="object-contain" fallback={item.title} />
    </Link>
    <div className="shelf-content">
      <h2><Link href={href}>{item.title}</Link></h2>
      {metadata.length ? <p className="shelf-metadata">{metadata.join(" · ")}</p> : null}
      <div className="shelf-reading">
        <span className={`shelf-status status-${item.status}`}>{statuses[item.status]}</span>
        <span className="shelf-count">{item.chapterReading.registered ? "Основные главы" : "Общий счётчик"}: {item.currentChapter}{item.progressCeiling === null ? "" : ` из ${item.progressCeiling}`}</span>
      </div>
      {percent !== null ? <div role="progressbar" aria-label={`Прочитано основных глав: ${item.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="shelf-progress"><span style={{ width: `${percent}%` }} /></div> : null}
      <div className="shelf-extras">
        {rating !== null ? <span aria-label={`Моя средняя оценка ${rating.toFixed(1)} из 5`}>★ {rating.toFixed(1)} / 5</span> : null}
      </div>
    </div>
    <details className="shelf-details">
      <summary><span className="shelf-details-label-v6">Подробнее <span aria-hidden="true">⌄</span></span>
        {note || item.chapterReading.updatedChapters ? <span className="shelf-signals-v6">
          {note ? <span>Заметка</span> : null}
          {item.chapterReading.updatedChapters ? <span>Новых редакций: {item.chapterReading.updatedChapters}</span> : null}
        </span> : null}
      </summary>
      <div className="shelf-details-body">
        {item.chapterReading.specialCount > 0 ? <p>Спецвыпуски: {item.chapterReading.specialReadCount} из {item.chapterReading.specialCount}</p> : null}
        {item.chapterReading.updatedChapters > 0 ? <p>Новых редакций: {item.chapterReading.updatedChapters}</p> : null}

        {item.seriesStatus !== "UNKNOWN" ? <p>{seriesStatusLabels[item.seriesStatus]}</p> : null}
        {item.chapterReading.registered ? <>
          {item.chapterReading.lastReadLabel ? <p>Последняя отмеченная: {item.chapterReading.lastReadLabel}</p> : null}
          <p>{item.chapterReading.caughtUp ? caughtUpLabel(item.seriesStatus) : `Непрочитанных основных глав: ${item.chapterReading.unreadChapters}`}</p>
        </> : <p>Список глав пока не заполнен. Прогресс хранится общим счётчиком.</p>}
        {note ? <blockquote>{note}</blockquote> : null}
        <Link href={href} className="tea-text-action">Оценки и заметка <span aria-hidden="true">→</span></Link>
        <TrackingControl comicId={item.comicId} enabled={item.trackingEnabled} />
      </div>
    </details>
  </article>;
}
