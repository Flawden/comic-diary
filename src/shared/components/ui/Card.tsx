import type {
  HTMLAttributes,
} from "react";

type CardProps =
  HTMLAttributes<HTMLDivElement>;

export function Card({
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-[var(--cd-radius-card)]",
        "border border-[var(--cd-border)]",
        "bg-[var(--cd-surface)]",
        "p-5",
        className,
      ].join(" ")}
      style={{
        boxShadow:
          "var(--cd-shadow-card)",
        ...props.style,
      }}
      {...props}
    />
  );
}
