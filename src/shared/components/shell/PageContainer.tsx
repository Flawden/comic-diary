import type { ReactNode } from "react";

export function PageContainer({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {children}
      </div>
    </main>
  );
}
