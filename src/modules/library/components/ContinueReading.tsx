import { comicListHref } from "@/modules/library/list-navigation";
import { getReadingTarget } from "../reading-target";
import { ReadingDestination } from "./ReadingDestination";
import Link from "next/link";
import { CoverImage } from "@/shared/components/media";
import type { UserLibraryItem } from "../queries/get-user-library";
import { getLibraryProgressPercent } from "../library-view";

export function ContinueReading({ items, listQuery }: { items: UserLibraryItem[]; listQuery: Record<string, string | string[] | undefined> }) {
  const reading = items.filter(item => item.status === "READING");
  const item = reading[0];
  if (!item) return null;
  const href = comicListHref(item.slug, "library", listQuery);
  const target = getReadingTarget(item.chapterReading.registry, item.chapterReading.readIds, item.sourceUrl);
  const percent = item.chapterReading.registered ? getLibraryProgressPercent(item.currentChapter, item.progressCeiling) : null;
  return <section className="diary-continue" aria-labelledby="continue-heading">
    <div className="diary-continue-heading"><h2 id="continue-heading">Читаю сейчас</h2>
      <Link href="/library?status=READING">На полке: {reading.length} <span aria-hidden="true">→</span></Link>
    </div>
    <div className="diary-continue-book">
      <Link href={href} className="diary-continue-cover">
        <CoverImage src={item.coverUrl} alt={`Обложка ${item.title}`} fallback={item.title} className="aspect-[2/3]" imageClassName="object-contain" />
      </Link>
      <div className="diary-continue-copy">
        <p className="diary-eyebrow">{item.visibility === "PRIVATE" ? "Личная история" : item.categoryName ?? "На вашей полке"}</p>
        <h3><Link href={href}>{item.title}</Link></h3>
        <p>{item.chapterReading.registered ? "Основные главы" : "Общий счётчик"}: {item.currentChapter}{item.progressCeiling === null ? "" : ` из ${item.progressCeiling}`}</p>
        {percent !== null ? <div className="diary-continue-progress"><progress max={100} value={percent} aria-label="Прогресс основных глав" /><span>{percent}%</span></div> : null}
        <Link href={href + "#my-reading"} className="tea-text-action">Отметки и заметка →</Link>
      </div>
    </div>
    <ReadingDestination target={target} comicHref={href} className="diary-reading-destination" />
  </section>;
}
