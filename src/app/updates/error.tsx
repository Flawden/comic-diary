"use client";
import { Button } from "@/shared/components/ui";
export default function Error({ reset }: { reset: () => void }) {
  return <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"><h1 className="text-xl font-bold">Не удалось загрузить главы</h1><p className="my-3 text-[var(--text-secondary)]">Это ошибка загрузки. Ваш список непрочитанного не потерян.</p><Button onClick={reset}>Попробовать снова</Button></section>;
}
