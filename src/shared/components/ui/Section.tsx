import type {
  ReactNode,
} from "react";

type SectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({
  title,
  description,
  action,
  children,
  className = "",
}: SectionProps) {
  return (
    <section
      className={[
        "space-y-4",
        className,
      ].join(" ")}
    >
      <div
        className="flex items-end justify-between gap-4"
      >
        <div>
          <h2
            className="text-xl font-bold text-[var(--cd-foreground)]"
          >
            {title}
          </h2>

          {description ? (
            <p
              className="mt-1 text-sm leading-6 text-[var(--cd-muted)]"
            >
              {description}
            </p>
          ) : null}
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}
