import type { ReactNode } from "react";

import {
  AppHeader,
  AppNavigation,
  PageContainer,
} from "./";

export function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader />
      <AppNavigation />
      <PageContainer>
        {children}
      </PageContainer>
    </>
  );
}
