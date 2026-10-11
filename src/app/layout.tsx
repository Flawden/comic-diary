import { cookies } from "next/headers";
import { resolveTheme, THEME_COOKIE } from "@/shared/theme/themes";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/shared/components/shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Читательский дневник",
  description: "Личный дневник для чтения и оценки комиксов",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="ru" data-theme={theme}>
      <body>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
