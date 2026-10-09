"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/updates", label: "Новое", path: "M4 5h16v14H4z M8 2v6 M16 2v6 M4 10h16 M8 14h3" },
  { href: "/library", label: "Библиотека", path: "M4 4h5v16H4z M10 4h5v16h-5z M17 5l3-1 3 15-3 1z" },
  { href: "/", label: "Каталог", path: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6" },
  { href: "/account", label: "Профиль", path: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21v-2a8 8 0 0 1 16 0v2" },
];
export function AppNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Основная навигация" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:border-b md:pb-0">
    <div className="mx-auto grid max-w-6xl grid-cols-4 gap-1 px-2 py-2 sm:px-6">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/comics/") : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[var(--primary)] md:flex-row md:gap-2 md:text-sm ${active ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"}`}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={item.path} /></svg>{item.label}
        </Link>;
      })}
    </div>
  </nav>;
}
