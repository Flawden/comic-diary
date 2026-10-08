import Link from "next/link";

type LibraryStatProps = {
  label: string;
  value: number;
  href: string;
};

export function LibraryStat({
  label,
  value,
  href,
}: LibraryStatProps) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
    >
      <p className="text-2xl font-bold">
        {value}
      </p>

      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {label}
      </p>
    </Link>
  );
}
