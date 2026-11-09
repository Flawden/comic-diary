import Link from "next/link";
import { AppNavigation } from "./AppNavigation";

export function AppHeader() {
  return (
    <header className="tea-header">
      <a href="#main-content" className="skip-link">К содержимому</a>
      <div className="tea-header-inner">
        <Link href="/library" className="tea-brand" aria-label="Белый Дракон — моя библиотека">
          <span className="tea-brand-mark" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
              <path d="M5 15h22v5a11 11 0 0 1-22 0v-5Z" fill="currentColor" />
              <path d="M27 16h2a4 4 0 0 1 0 8h-3M4 31h25M13 11c-5-4 4-5 0-9M20 11c-4-3 3-4 1-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <span className="tea-brand-copy">
            <strong>Белый Дракон</strong>
            <span className="tea-brand-caption">Чайная историй</span>
          </span>
        </Link>
        <AppNavigation />
        <Link href="/account" className="tea-account" aria-label="Профиль и оформление" title="Профиль и оформление">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/></svg>
        </Link>
      </div>
    </header>
  );
}
