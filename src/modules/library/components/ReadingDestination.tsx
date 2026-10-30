import Link from "next/link";
import type { getReadingTarget } from "../reading-target";

type Props = { target: ReturnType<typeof getReadingTarget>; slug: string; className?: string };

export function ReadingDestination({ target, slug, className = "" }: Props) {
  const { chapter, source, direct, state } = target;
  return <div className={`reading-destination ${className}`}>
    {chapter ? <p className="reading-destination-hint">Первая непрочитанная: {chapter.displayCode}{chapter.title ? ` — ${chapter.title}` : ""}{chapter.supersedesChapterId ? " · новая редакция" : ""}</p>
      : <p className="reading-destination-hint">{state === "CAUGHT_UP" ? "Все вышедшие основные главы отмечены прочитанными." : "Нет доступных основных глав для продолжения."}</p>}
    {source ? <a className="tea-primary" href={source.href} target="_blank" rel="noopener noreferrer">
      {direct && chapter ? `Читать главу ${chapter.displayCode}` : source.label} <span aria-hidden="true">↗</span><span className="sr-only"> — в новой вкладке</span>
    </a> : <Link href={`/comics/${slug}#chapters`} className="tea-primary">К списку глав →</Link>}
    {chapter && !direct ? <p className="reading-destination-hint">Прямой ссылки на эту главу пока нет.{source ? " Откроется общий источник истории." : " Ссылку можно проверить в списке глав."}</p> : null}
    <p className="reading-destination-note">После чтения вернитесь и отметьте главу в дневнике.</p>
  </div>;
}
