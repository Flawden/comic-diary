import type { ReactNode } from "react";

export function PageContainer({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {children}
      </div>
    </main>
  );
}
