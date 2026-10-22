import type { ReactNode } from "react";

import {
  AppHeader,
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
      <PageContainer>
        {children}
      </PageContainer>
    </>
  );
}
