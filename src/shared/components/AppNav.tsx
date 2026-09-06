"use client";

import Link from "next/link";
import {
  usePathname,
} from "next/navigation";

const navItems = [
  {
    href: "/",
    label: "Каталог",
    isActive: (
      pathname: string,
    ) =>
      pathname === "/" ||
      pathname.startsWith(
        "/comics/",
      ),
  },
  {
    href: "/library",
    label: "Моя библиотека",
    isActive: (
      pathname: string,
    ) =>
      pathname.startsWith(
        "/library",
      ),
  },
  {
    href: "/account",
    label: "Профиль",
    isActive: (
      pathname: string,
    ) =>
      pathname.startsWith(
        "/account",
      ),
  },
] as const;

export function AppNav() {
  const pathname =
    usePathname();

  return (
    <header className="border-b border-black/5 bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="font-bold text-[var(--foreground)]"
        >
          Читательский дневник
        </Link>

        <nav
          aria-label="Основная навигация"
          className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:items-center"
        >
          {navItems.map(
            (item) => {
              const active =
                item.isActive(
                  pathname,
                );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    active
                      ? "page"
                      : undefined
                  }
                  className={
                    active
                      ? "inline-flex min-w-0 items-center justify-center rounded-xl bg-[var(--primary)] px-3 py-2 text-center text-sm font-semibold text-white sm:px-4"
                      : "inline-flex min-w-0 items-center justify-center rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2 text-center text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--background)] sm:px-4"
                  }
                >
                  {item.label}
                </Link>
              );
            },
          )}
        </nav>
      </div>
    </header>
  );
}
