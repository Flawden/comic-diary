import Link from "next/link";

export function AppHeader() {
  return (
    <header className="border-b border-black/10 bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="font-bold text-[var(--foreground)]"
        >
          Читательский дневник
        </Link>

        <div className="text-sm text-[var(--muted)]">
          Comic Diary
        </div>
      </div>
    </header>
  );
}
