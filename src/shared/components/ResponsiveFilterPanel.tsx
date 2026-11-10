"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

const mediaQuery = "(max-width: 720px)";

function subscribeToMobileViewport(onChange: () => void) {
  const query = window.matchMedia(mediaQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isMobileViewport() {
  return window.matchMedia(mediaQuery).matches;
}

function serverViewport() {
  return false;
}

type ResponsiveFilterPanelProps = {
  children: ReactNode;
  label: string;
  initiallyExpanded?: boolean;
  className?: string;
};

/** Keep server-rendered forms intact. Collapse only their presentation on phones. */
export function ResponsiveFilterPanel({
  children,
  label,
  initiallyExpanded = false,
  className = "",
}: ResponsiveFilterPanelProps) {
  const mobile = useSyncExternalStore(subscribeToMobileViewport, isMobileViewport, serverViewport);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const contentId = useId();
  const isExpanded = !mobile || expanded;

  return (
    <div className={`responsive-filter-panel ${className}`.trim()}>
      <button
        type="button"
        className="responsive-filter-toggle"
        aria-controls={contentId}
        aria-expanded={isExpanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{label}</span>
        <span className="responsive-filter-chevron" aria-hidden="true">▾</span>
      </button>
      <div id={contentId} className="responsive-filter-content" hidden={!isExpanded}>
        {children}
      </div>
    </div>
  );
}
