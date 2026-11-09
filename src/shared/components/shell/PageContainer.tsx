import type { ReactNode } from "react";

export function PageContainer({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main id="main-content" className="fantasy-page-container min-h-screen px-4 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {children}
      </div>
    </main>
  );
}
