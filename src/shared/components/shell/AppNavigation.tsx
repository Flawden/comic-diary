"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderCatalogSearch } from "./HeaderCatalogSearch";

const items = [
  { href: "/library", label: "Дневник", path: "M4 4h5v16H4z M10 4h5v16h-5z M17 5l3-1 3 15-3 1z" },
  { href: "/", label: "Каталог", path: "M3 4h7v16H3z M10 4h7v16h-7z M17 7h4v13h-4z M5 8h3 M12 8h3 M19 11v5" },
  { href: "/updates", label: "Обновления", path: "M4 5h16v14H4z M8 2v6 M16 2v6 M4 10h16 M8 14h3" },
];
export function AppNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Основная навигация" className="tea-navigation">
    <div className="tea-navigation-items">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/comics/") : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`tea-nav-link ${active ? "is-active" : ""}`}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={item.path} /></svg><span className="tea-nav-label">{item.label}</span>
        </Link>;
      })}
      <HeaderCatalogSearch />
    </div>
  </nav>;
}
