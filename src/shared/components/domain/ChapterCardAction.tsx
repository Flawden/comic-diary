"use client";

import {
  Button,
} from "@/shared/components/ui";

type ChapterCardActionProps = {
  chapterNumber: string;
};

export function ChapterCardAction({
  chapterNumber,
}: ChapterCardActionProps) {
  return (
    <Button
      variant="secondary"
      onClick={() => {
        console.log(
          "open chapter",
          chapterNumber,
        );
      }}
    >
      Открыть
    </Button>
  );
}
