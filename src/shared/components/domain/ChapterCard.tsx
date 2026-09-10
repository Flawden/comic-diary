import {
  Badge,
  Card,
} from "@/shared/components/ui";

import {
  ChapterCardAction,
} from "./ChapterCardAction";

export type ChapterStatus =
  | "draft"
  | "released"
  | "reading"
  | "completed";

type ChapterCardProps = {
  number: string;
  title: string;
  pages?: number;
  status?: ChapterStatus;
};

const statusLabels:
Record<ChapterStatus, string> = {
  draft: "Черновик",
  released: "Выпущено",
  reading: "Читаю",
  completed: "Прочитано",
};

const statusVariants = {
  draft: "neutral",
  released: "success",
  reading: "primary",
  completed: "info",
} as const;

export function ChapterCard({
  number,
  title,
  pages,
  status = "released",
}: ChapterCardProps) {
  return (
    <Card
      variant="interactive"
      className="space-y-4"
    >
      <div
        className="flex items-start justify-between gap-4"
      >
        <div>
          <div
            className="text-sm text-[var(--muted)]"
          >
            Глава {number}
          </div>

          <h3
            className="mt-1 text-lg font-bold text-[var(--foreground)]"
          >
            {title}
          </h3>
        </div>

        <Badge
          variant={statusVariants[status]}
        >
          {statusLabels[status]}
        </Badge>
      </div>

      {pages ? (
        <div
          className="text-sm text-[var(--muted)]"
        >
          {pages} страниц
        </div>
      ) : null}

      <ChapterCardAction
        chapterNumber={number}
      />
    </Card>
  );
}
