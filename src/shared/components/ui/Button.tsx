import type {
  ButtonHTMLAttributes,
} from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger";

export type ButtonSize =
  | "sm"
  | "md"
  | "lg";

type ButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    iconOnly?: boolean;
  };

const variantClasses:
Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",

  secondary:
    "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--foreground)] hover:bg-[var(--surface)]",

  ghost:
    "border-transparent bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-raised)]",

  danger:
    "bg-[var(--danger)] text-[var(--primary-foreground)] hover:opacity-90",
};

const sizeClasses:
Record<ButtonSize, string> = {
  sm:
    "min-h-9 px-3 py-2 text-xs",

  md:
    "min-h-11 px-4 py-2.5 text-sm",

  lg:
    "min-h-12 px-6 py-3 text-base",
};

const iconSizeClasses:
Record<ButtonSize, string> = {
  sm:
    "h-9 w-9",

  md:
    "h-11 w-11",

  lg:
    "h-12 w-12",
};

export function Button({
  variant = "primary",
  size = "md",
  iconOnly = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center",
        "rounded-[var(--cd-radius-button)]",
        "border",
        "font-semibold",
        "transition",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[var(--primary)]",
        "focus-visible:ring-offset-2",
        "focus-visible:ring-offset-[var(--background)]",
        "disabled:cursor-not-allowed",
        "disabled:opacity-50",
        iconOnly
          ? iconSizeClasses[size]
          : sizeClasses[size],
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
