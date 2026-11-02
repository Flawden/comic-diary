import Link from "next/link";
import { teaCollectionSlug, type getCollectionProgress } from "../queries/get-collection-progress";

export function CollectionProgress({ progress }: { progress: Awaited<ReturnType<typeof getCollectionProgress>> }) {
  if (!progress) return null;
  const { name, completed, published, archivedOnShelf } = progress;
  return <section aria-labelledby="tea-progress-title" className="reader-panel mt-5">
    <h2 id="tea-progress-title">{name}</h2>
    {published > 0 ? <>
      <p className="mt-2">Прочитано историй: <strong>{completed} из {published}</strong></p>
      <progress className="mt-2 block w-full accent-[var(--primary)]" value={completed} max={published}
        aria-label={`Прочитано историй в коллекции «${name}»`} />
      <Link className="tea-text-action" href={`/?category=${teaCollectionSlug}#catalog`}>Открыть коллекцию →</Link>
    </> : <p className="mt-2">В коллекции пока нет опубликованных историй.</p>}
    {archivedOnShelf > 0 ? <p className="text-sm text-[var(--text-secondary)]">Архивных историй на вашей полке: {archivedOnShelf}. Они не входят в этот счётчик.</p> : null}
  </section>;
}
