"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./ProfileEntryMenu.module.css";

function ProfileIcon() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/></svg>;
}

/**
 * The public header retains the original profile link for regular readers.
 * Staff receive two destinations inside the same 44px icon, without making
 * the already compact mobile navigation wider.
 *
 * Visibility is a UI hint only: /admin enforces its own server-side access.
 */
export function ProfileEntryMenu() {
  const pathname = usePathname();
  const [canAccessWorkspace, setCanAccessWorkspace] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Recheck on public navigation so login/role changes do not leave a stale link.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/account/workspace-access", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (!controller.signal.aborted && data !== null && typeof data === "object" && "canAccessWorkspace" in data) {
          setCanAccessWorkspace((data as { canAccessWorkspace?: unknown }).canAccessWorkspace === true);
        }
      } catch {
        // The ordinary profile link remains usable if the check is unavailable.
      }
    })();
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      {canAccessWorkspace ? (
        <>
          <button
            ref={triggerRef}
            type="button"
            className={`tea-account ${styles.trigger}`}
            aria-label="Меню профиля и управления"
            title="Меню профиля и управления"
            aria-expanded={open}
            aria-controls="public-profile-workspace-menu"
            onClick={() => setOpen(value => !value)}
          >
            <ProfileIcon />
          </button>
          {open && (
            <nav id="public-profile-workspace-menu" aria-label="Действия профиля" className={styles.menu}>
              <Link href="/admin" className={styles.item} onClick={() => setOpen(false)}>Панель управления</Link>
              <Link href="/account" className={styles.item} onClick={() => setOpen(false)}>Личный профиль</Link>
            </nav>
          )}
        </>
      ) : (
        <Link href="/account" className={`tea-account ${styles.trigger}`} aria-label="Профиль и оформление" title="Профиль и оформление">
          <ProfileIcon />
        </Link>
      )}
    </div>
  );
}
