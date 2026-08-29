type LibraryStatProps = {
    label: string;
    value: number;
};

export function LibraryStat({ label, value }: LibraryStatProps) {
    return (
        <div className="rounded-xl bg-[var(--surface)] p-4">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
    );
}