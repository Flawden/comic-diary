"use client";

import { useSyncExternalStore } from "react";

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function currentHash() {
  return window.location.hash;
}

function serverHash() {
  return "";
}

/** Reactive URL fragment without changing the Next.js router or losing editor drafts. */
export function useLocationHash() {
  return useSyncExternalStore(subscribeToHash, currentHash, serverHash);
}
