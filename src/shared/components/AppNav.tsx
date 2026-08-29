import Link from "next/link";

export function AppNav() {
  return (
    <header className="border-b border-black/5 bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/"
          className="font-bold text-[var(--foreground)]"
        >
          Читательский дневник
        </Link>

        <nav
          aria-label="Основная навигация"
          className="flex items-center gap-2"
        >
          <Link
            href="/"
            className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--background)]"
          >
            Каталог
          </Link>

          <Link
            href="/library"
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Моя библиотека
          </Link>
        </nav>
      </div>
    </header>
  );
}
