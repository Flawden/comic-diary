"use client";

import { createContext, useContext, useOptimistic, type ReactNode } from "react";

// One optimistic read registry feeds both the hero and the chapter controls.
// React rolls optimistic values back if the surrounding action fails; a
// successful router.refresh() supplies the new authoritative server read IDs.
type ChapterProgressContextValue = {
  readIds: number[];
  showReadIds: (next: number[]) => void;
};

const ChapterProgressContext = createContext<ChapterProgressContextValue | null>(null);

export function WorkChapterProgressProvider({ readIds, children }: { readIds: number[]; children: ReactNode }) {
  const [optimisticReadIds, showReadIds] = useOptimistic(readIds, (_previous: number[], next: number[]) => next);
  return <ChapterProgressContext.Provider value={{ readIds: optimisticReadIds, showReadIds }}>
    {children}
  </ChapterProgressContext.Provider>;
}

export function useWorkChapterProgress() {
  const context = useContext(ChapterProgressContext);
  if (!context) throw new Error("WorkChapterProgressProvider is required");
  return context;
}

export function WorkHeroProgress({ mainChapterIds }: { mainChapterIds: number[] }) {
  const { readIds } = useWorkChapterProgress();
  if (!mainChapterIds.length) return null;
  const read = new Set(readIds);
  const completed = mainChapterIds.filter(id => read.has(id)).length;
  const total = mainChapterIds.length;
  return <div className="wd-hero-progress" role="group" aria-label="Прогресс чтения произведения">
    <div className="wd-hero-progress-heading"><span>Прогресс чтения</span><strong>Прочитано: {completed} из {total}</strong></div>
    <progress aria-label="Прогресс чтения" max={total} value={completed} />
    <p>{completed === total ? "Все вышедшие основные главы прочитаны." : `Осталось основных глав: ${total - completed}`}</p>
  </div>;
}
