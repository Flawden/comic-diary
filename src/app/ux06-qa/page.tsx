"use client";

import { useEffect } from "react";
import { WorkDescriptionModal } from "@/modules/comics/components/WorkDescriptionModal";

const description = Array.from({ length: 14 }, (_, i) =>
  `Глава ${i + 1}. Однажды в чайной Белого Дракона открылась необычная книга. ` +
  `Длинное описание должно открываться аккуратно и оставаться удобным для чтения ` +
  `на узком экране телефона. Это только демонстрационный текст проверки UX-06.`
).join("\n\n");

export default function Ux06SyntheticQaPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const theme = params.get("theme");
    if (theme === "tea" || theme === "paper" || theme === "night") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, []);

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 12px 80px" }}>
      <section style={{ padding: 12, border: "1px solid var(--cd-border)", borderRadius: 12, background: "var(--cd-surface)", marginBottom: 16 }}>
        <strong>UX-06 · Изолированный тест интерфейса</strong>
        <p style={{ fontSize: 13, marginTop: 6 }}>Демонстрационный текст. Ни реальная база, ни production не используются.</p>
      </section>
      <div className="catalog-page" style={{ marginBottom: 20 }}>
        <section className="catalog-hero">
          <div className="catalog-hero-copy">
            <h1>Белый Дракон — каталог</h1>
            <p>Тематический фон каталога</p>
          </div>
        </section>
      </div>
      <div className="wd-work" style={{ marginTop: 18 }}>
        <div className="wd-hero-summary" style={{ padding: 16, background: "var(--cd-surface)", borderRadius: 14 }}>
          <WorkDescriptionModal text={description} />
        </div>
      </div>
    </main>
  );
}
