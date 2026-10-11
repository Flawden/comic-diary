"use client";

import { useRef, useState } from "react";
import { Button } from "@/shared/components/ui/Button";

export function LogoutButton() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) throw new Error("Logout failed");
      // A full navigation discards cached pages from the authenticated session.
      window.location.replace("/login");
    } catch {
      pending.current = false;
      setBusy(false);
      setError("Не удалось выйти из аккаунта. Проверьте соединение и попробуйте ещё раз.");
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="secondary" disabled={busy} onClick={() => void logout()}>
        {busy ? "Выходим…" : "Выйти из аккаунта"}
      </Button>
      {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
