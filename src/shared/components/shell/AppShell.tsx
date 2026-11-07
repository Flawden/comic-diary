"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { PageContainer } from "./PageContainer";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  // The /admin route tree renders its own authorized, responsive workspace.
  // Public pages retain the existing reader header and page container.
  if (isAdmin) return <>{children}</>;

  return (
    <>
      <AppHeader />
      <PageContainer>{children}</PageContainer>
    </>
  );
}
