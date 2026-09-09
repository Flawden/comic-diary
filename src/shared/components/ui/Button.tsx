import type {
  ButtonHTMLAttributes,
} from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger";

type ButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  };

const variantClasses:
Record<
  ButtonVariant,
  string
> = {
  primary:
    "border-transparent bg-[var(--cd-primary)] text-white hover:opacity-90",
  secondary:
    "border-[var(--cd-border)] bg-[var(--cd-surface-elevated)] text-[var(--cd-foreground)] hover:bg-[var(--cd-surface)]",
  ghost:
    "border-[var(--cd-border)] bg-transparent text-[var(--cd-foreground)] hover:bg-[var(--cd-surface-elevated)]",
  danger:
    "border-transparent bg-[var(--cd-danger)] text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex min-h-11",
        "items-center justify-center",
        "rounded-[var(--cd-radius-button)]",
        "border px-4 py-2.5",
        "text-sm font-semibold",
        "transition",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[var(--cd-primary)]",
        "focus-visible:ring-offset-2",
        "focus-visible:ring-offset-[var(--cd-background)]",
        "disabled:cursor-not-allowed",
        "disabled:opacity-50",
        variantClasses[
          variant
        ],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
