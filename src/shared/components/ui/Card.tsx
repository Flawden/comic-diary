import type {
  HTMLAttributes,
} from "react";

export type CardVariant =
  | "default"
  | "raised"
  | "interactive";

export type CardPadding =
  | "sm"
  | "md"
  | "lg";

type CardProps =
  HTMLAttributes<HTMLDivElement> & {
    variant?: CardVariant;
    padding?: CardPadding;
  };

const variantClasses:
Record<CardVariant, string> = {
  default:
    "bg-[var(--surface)]",

  raised:
    "bg-[var(--surface-raised)]",

  interactive:
    [
      "bg-[var(--surface)]",
      "cursor-pointer",
      "transition",
      "hover:-translate-y-0.5",
      "hover:shadow-[var(--cd-shadow-floating)]",
    ].join(" "),
};

const paddingClasses:
Record<CardPadding, string> = {
  sm:
    "p-3",

  md:
    "p-5",

  lg:
    "p-6",
};

export function Card({
  variant = "default",
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-[var(--cd-radius-card)]",
        "border border-[var(--border)]",
        "shadow-[var(--cd-shadow-card)]",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
