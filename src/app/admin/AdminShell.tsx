"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useLocationHash } from "@/shared/hooks/useLocationHash";

type Permissions = {
  editCatalog: boolean;
  manageUsers: boolean;
  runImport: boolean;
  viewAudit: boolean;
};

type AdminShellProps = {
  children: ReactNode;
  role: "ADMIN" | "EDITOR" | "USER";
  permissions: Permissions;
};

const icons = {
  home: "M3 10.5 12 3l9 7.5V21h-7v-7H10v7H3Z",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  books: "M4 3h5v18H4z M10 3h5v18h-5z M16 5l4-1 2 16-4 1z",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5 M3 16l9 5 9-5",
  users: "M16 19v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 19v-2a4 4 0 0 0-3-3.87 M16 1.13a4 4 0 0 1 0 7.75",
  import: "M12 3v12m0 0-5-5m5 5 5-5 M4 17v4h16v-4",
  audit: "M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5h-3 M8 12h8 M8 16h8",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2 2-.06-.06A1.65 1.65 0 0 0 15.9 18.5 1.65 1.65 0 0 0 15 20v.1h-3V20a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.82.33l-.06.06-2-2 .06-.06A1.65 1.65 0 0 0 7.5 15.9 1.65 1.65 0 0 0 6 15H5.9v-3H6a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06 2-2 .06.06A1.65 1.65 0 0 0 11 7.5 1.65 1.65 0 0 0 12 6V5.9h3V6a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.82-.33l.06-.06 2 2-.06.06A1.65 1.65 0 0 0 19.5 11 1.65 1.65 0 0 0 21 12v3h-.1a1.65 1.65 0 0 0-1.5 0Z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2",
} as const;

type IconName = keyof typeof icons;
function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name]} />
    </svg>
  );
}

export function AdminShell({ children, role, permissions }: AdminShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hash = useLocationHash();

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  const inComics = pathname === "/admin/comics" || pathname.startsWith("/admin/comics/");
  const isChapterTab = inComics && hash === "#chapters";
  const items: { href: string; label: string; icon: IconName; active: boolean }[] = [
    { href: "/admin", label: "Панель управления", icon: "home", active: pathname === "/admin" },
    { href: "/", label: "Каталог сайта", icon: "grid", active: false },
    ...(permissions.editCatalog ? [
      { href: "/admin/comics#metadata", label: "Комиксы", icon: "books" as const, active: inComics && !isChapterTab },
      { href: "/admin/comics#chapters", label: "Главы", icon: "layers" as const, active: isChapterTab },
      { href: "/admin/categories", label: "Категории", icon: "grid" as const, active: pathname.startsWith("/admin/categories") },
    ] : []),
    ...(permissions.manageUsers ? [
      { href: "/admin/users", label: "Пользователи", icon: "users" as const, active: pathname.startsWith("/admin/users") },
    ] : []),
    ...(permissions.runImport ? [
      { href: "/admin/catalog-import/vk", label: "Импорт", icon: "import" as const, active: pathname.startsWith("/admin/catalog-import") },
    ] : []),
    ...(permissions.viewAudit ? [
      { href: "/admin/audit", label: "Журнал аудита", icon: "audit" as const, active: pathname.startsWith("/admin/audit") },
    ] : []),
    { href: "/account", label: "Настройки профиля", icon: "settings", active: false },
  ];

  return (
    <div className="admin-shell">
      <a href="#main-content" className="skip-link admin-shell-skip">К содержимому</a>
      <button className="admin-shell-mobile-toggle" type="button"
        aria-controls="admin-shell-navigation" aria-expanded={open}
        onClick={() => setOpen(current => !current)}>
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        <span>Белый Дракон · Меню</span>
      </button>
      {open && <button type="button" className="admin-shell-overlay"
        onClick={() => setOpen(false)} aria-label="Закрыть меню" />}
      <aside id="admin-shell-navigation" className={`admin-shell-sidebar${open ? " is-open" : ""}`}>
        <Link href="/admin" className="admin-shell-brand" onClick={() => setOpen(false)}>
          <svg aria-hidden="true" width="35" height="35" viewBox="0 0 36 36" fill="none">
            <path d="M5 15h22v5a11 11 0 0 1-22 0v-5Z" fill="currentColor" />
            <path d="M27 16h2a4 4 0 0 1 0 8h-3M4 31h25M13 11c-5-4 4-5 0-9M20 11c-4-3 3-4 1-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Белый Дракон</span>
          <small>Админ-панель Comic Diary</small>
        </Link>
        <nav aria-label="Разделы админ-панели" className="admin-shell-nav">
          {items.map(item => (
            <Link key={item.href} href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`admin-shell-link${item.active ? " is-active" : ""}`}
              onClick={event => {
                setOpen(false);
                // A same-page fragment needs a native hashchange so the
                // chapter tab and sidebar selection update together.
                if (inComics && item.href.startsWith("/admin/comics#")) {
                  event.preventDefault();
                  const target = item.href.substring(item.href.indexOf("#"));
                  if (window.location.hash !== target) window.location.hash = target;
                }
              }}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <Link href="/account" className="admin-shell-account" onClick={() => setOpen(false)}>
          <span className="admin-shell-account-icon"><Icon name="person" /></span>
          <span>{role === "ADMIN" ? "Администратор" : "Редактор"}<small>Личный профиль</small></span>
          <span aria-hidden="true">⌄</span>
        </Link>
      </aside>
      <main id="main-content" className="admin-shell-main">
        {children}
      </main>
    </div>
  );
}
