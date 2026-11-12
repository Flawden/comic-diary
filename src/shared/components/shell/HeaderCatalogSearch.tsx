"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./HeaderCatalogSearch.module.css";

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="m16 16 5 5" />
    </svg>
  );
}

export function HeaderCatalogSearch() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button ref={triggerRef} type="button" className={`tea-account ${styles.trigger}`}
        aria-label="Поиск по каталогу" title="Поиск по каталогу"
        aria-expanded={open} aria-controls="header-catalog-search"
        onClick={() => setOpen(value => !value)}>
        <SearchIcon />
      </button>
      {open && (
        <form id="header-catalog-search" role="search" aria-label="Поиск произведений"
          method="get" action="/#catalog" className={styles.form}>
          <label htmlFor="header-catalog-query">Найти произведение</label>
          <div className={styles.controls}>
            <input ref={searchRef} id="header-catalog-query" type="search" name="q"
              aria-label="Название произведения" placeholder="Название комикса…"
              required maxLength={120} autoComplete="off" />
            <button type="submit">Найти</button>
          </div>
          <p>Откроется каталог с результатами поиска.</p>
        </form>
      )}
    </div>
  );
}
