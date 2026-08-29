import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Читательский дневник",
    description: "Личный дневник для чтения и оценки комиксов",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="ru">
        <body>{children}</body>
        </html>
    );
}