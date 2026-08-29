import type { ComicListItem } from "@/modules/comics/queries/get-comics";

type ComicCardProps = {
  comic: ComicListItem;
};

export function ComicCard({ comic }: ComicCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-black/5 bg-[var(--surface)] shadow-sm">
      <div className="grid sm:grid-cols-[140px_1fr]">
        <div className="aspect-[3/4] bg-[#e4e1d7] sm:aspect-auto">
          {comic.coverUrl ? (
            <div
              role="img"
              aria-label={`Обложка ${comic.title}`}
              className="h-full min-h-48 bg-cover bg-center"
              style={{
                backgroundImage: `url("${comic.coverUrl}")`,
              }}
            />
          ) : (
            <div className="flex h-full min-h-48 items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
              Обложка появится позже
            </div>
          )}
        </div>

        <div className="flex flex-col p-5">
          <div>
            <p className="text-sm font-medium text-[var(--primary)]">
              {comic.categoryName ?? "Без категории"}
            </p>

            <h3 className="mt-1 text-xl font-semibold">
              {comic.title}
            </h3>

            <p className="mt-2 text-sm text-[var(--muted)]">
              {comic.totalChapters === null
                ? "Количество глав пока не указано"
                : `Глав: ${comic.totalChapters}`}
            </p>

            {comic.description ? (
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                {comic.description}
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            <a
              href={comic.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Читать в VK
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
