import Link from "next/link";
import { CoverImage } from "@/shared/components/media";
import type { UserLibraryItem } from "../queries/get-user-library";
import { getLibraryProgressPercent } from "../library-view";

function sourceLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const vk = ["vk.com", "vk.ru"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return { href: url.href, label: vk ? "Открыть в VK" : "Открыть источник" };
  } catch { return null; }
}

export function ContinueReading({ items }: { items: UserLibraryItem[] }) {
  const reading = items.filter(item => item.status === "READING");
  const item = reading[0];
  if (!item) return null;
  const source = sourceLink(item.sourceUrl);
  const percent = item.chapterReading.registered ? getLibraryProgressPercent(item.currentChapter, item.progressCeiling) : null;
  return <section className="diary-continue" aria-labelledby="continue-heading">
    <div className="diary-continue-heading"><h2 id="continue-heading">Читаю сейчас</h2>
      <Link href="/library?status=READING">На полке: {reading.length} <span aria-hidden="true">→</span></Link>
    </div>
    <div className="diary-continue-book">
      <Link href={`/comics/${item.slug}`} className="diary-continue-cover">
        <CoverImage src={item.coverUrl} alt={`Обложка ${item.title}`} fallback={item.title} className="aspect-[2/3]" imageClassName="object-contain" />
      </Link>
      <div className="diary-continue-copy">
        <p className="diary-eyebrow">{item.visibility === "PRIVATE" ? "Личная история" : item.categoryName ?? "На вашей полке"}</p>
        <h3><Link href={`/comics/${item.slug}`}>{item.title}</Link></h3>
        <p>{item.chapterReading.registered ? "Основные главы" : "Общий счётчик"}: {item.currentChapter}{item.progressCeiling === null ? "" : ` из ${item.progressCeiling}`}</p>
        {percent !== null ? <div className="diary-continue-progress"><progress max={100} value={percent} aria-label="Прогресс основных глав" /><span>{percent}%</span></div> : null}
        <Link href={`/comics/${item.slug}#my-reading`} className="tea-text-action">Отметки и заметка →</Link>
      </div>
    </div>
    {source ? <a className="tea-primary diary-continue-button" href={source.href} target="_blank" rel="noopener noreferrer">{source.label} <span aria-hidden="true">↗</span><span className="sr-only"> — в новой вкладке</span></a>
      : <Link href={`/comics/${item.slug}`} className="tea-primary diary-continue-button">Открыть карточку →</Link>}
  </section>;
}
