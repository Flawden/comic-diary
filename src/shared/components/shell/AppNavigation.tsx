"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/",
    label: "Каталог",
  },
  {
    href: "/library",
    label: "Библиотека",
  },
  {
    href: "/account",
    label: "Профиль",
  },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Основная навигация"
      className="border-b border-black/10 bg-[var(--surface)]"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 px-4 py-3 sm:px-6">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "rounded-xl bg-[var(--primary)] px-3 py-2 text-center text-sm font-semibold text-white"
                  : "rounded-xl border border-black/10 px-3 py-2 text-center text-sm font-semibold text-[var(--foreground)]"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
