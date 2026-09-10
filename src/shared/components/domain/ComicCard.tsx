/* eslint-disable @next/next/no-img-element */

import {
  Badge,
  Card,
} from "@/shared/components/ui";

export type ComicStatus =
  | "draft"
  | "reading"
  | "completed"
  | "dropped";

type ComicCardProps = {
  title: string;
  author?: string;
  genres?: string[];
  cover?: string;
  rating?: number;
  status?: ComicStatus;
};

const statusLabels:
Record<ComicStatus, string> = {
  draft: "Черновик",
  reading: "Читаю",
  completed: "Прочитано",
  dropped: "Брошено",
};

const statusVariants = {
  draft: "neutral",
  reading: "primary",
  completed: "success",
  dropped: "danger",
} as const;


export function ComicCard({
  title,
  author,
  genres = [],
  cover,
  rating,
  status = "draft",
}: ComicCardProps) {
  return (
    <Card
      variant="interactive"
      className="space-y-4"
    >
      <div className="flex gap-4">

        <div
          className="
            flex h-40 w-28 shrink-0
            items-center justify-center
            rounded-xl
            bg-[var(--surface-raised)]
            text-xs
            text-[var(--muted)]
          "
        >
          {cover ? (
            /*
              Image strategy will be finalized
              with real catalog media layer.
            */
            <img
              src={cover}
              alt={title}
              className="h-full w-full rounded-xl object-cover"
            />
          ) : (
            "Нет обложки"
          )}
        </div>


        <div className="min-w-0 flex-1">

          <div className="flex items-start justify-between gap-3">

            <h3
              className="
                text-lg
                font-bold
                text-[var(--foreground)]
              "
            >
              {title}
            </h3>

            <Badge
              variant={statusVariants[status]}
            >
              {statusLabels[status]}
            </Badge>

          </div>


          {author ? (
            <p
              className="
                mt-2
                text-sm
                text-[var(--muted)]
              "
            >
              {author}
            </p>
          ) : null}


          {genres.length > 0 ? (
            <div
              className="
                mt-3
                flex
                flex-wrap
                gap-2
              "
            >
              {genres.map((genre) => (
                <span
                  key={genre}
                  className="
                    rounded-full
                    border
                    border-[var(--border)]
                    px-2
                    py-1
                    text-xs
                    text-[var(--muted)]
                  "
                >
                  {genre}
                </span>
              ))}
            </div>
          ) : null}


          {rating ? (
            <div
              className="
                mt-3
                text-sm
                font-semibold
                text-[var(--primary)]
              "
            >
              ★ {rating}/10
            </div>
          ) : null}

        </div>

      </div>
    </Card>
  );
}
