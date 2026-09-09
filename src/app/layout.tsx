import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/shared/components/shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Читательский дневник",
  description: "Личный дневник для чтения и оценки комиксов",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
