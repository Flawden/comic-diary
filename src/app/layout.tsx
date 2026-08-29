import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Р§РёС‚Р°С‚РµР»СЊСЃРєРёР№ РґРЅРµРІРЅРёРє",
  description: "Р›РёС‡РЅС‹Р№ РґРЅРµРІРЅРёРє РґР»СЏ С‡С‚РµРЅРёСЏ Рё РѕС†РµРЅРєРё РєРѕРјРёРєСЃРѕРІ",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
