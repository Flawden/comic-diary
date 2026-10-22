"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

const key = "comic-diary-library-view";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("library-view-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("library-view-change", callback);
  };
}
function snapshot() {
  try { return localStorage.getItem(key) === "grid" ? "grid" : "list"; }
  catch { return "list"; }
}

export function LibraryView({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, snapshot, () => "list");
  const [fallback, setFallback] = useState<"grid" | "list" | null>(null);
  const view = fallback ?? stored;
  function choose(next: "grid" | "list") {
    try {
      localStorage.setItem(key, next);
      setFallback(null);
      window.dispatchEvent(new Event("library-view-change"));
    } catch { setFallback(next); }
  }
  return <section className="library-view" aria-label="Комиксы в библиотеке">
    <div className="library-view-toolbar">
      <span>На моей полке</span>
      <div className="library-view-switch" role="group" aria-label="Вид библиотеки">
        <button type="button" aria-label="Список" title="Список" aria-pressed={view === "list"} onClick={() => choose("list")}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <button type="button" aria-label="Сетка" title="Сетка" aria-pressed={view === "grid"} onClick={() => choose("grid")}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>
        </button>
      </div>
    </div>
    <div className={`library-collection is-${view}`}>{children}</div>
  </section>;
}
