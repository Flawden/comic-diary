import type {
  CSSProperties,
  HTMLAttributes,
} from "react";

export type BadgeVariant =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

type BadgeProps =
  HTMLAttributes<HTMLSpanElement> & {
    variant?: BadgeVariant;
  };

const tokenByVariant:
Record<
  BadgeVariant,
  string
> = {
  neutral:
    "--cd-muted",
  primary:
    "--cd-primary",
  success:
    "--cd-success",
  warning:
    "--cd-warning",
  danger:
    "--cd-danger",
  info:
    "--cd-info",
};

export function Badge({
  variant = "neutral",
  className = "",
  style,
  ...props
}: BadgeProps) {
  const token =
    tokenByVariant[
      variant
    ];

  const badgeStyle:
  CSSProperties = {
    color:
      `var(${token})`,
    background:
      `color-mix(in srgb, var(${token}) 14%, transparent)`,
    borderColor:
      `color-mix(in srgb, var(${token}) 34%, transparent)`,
    ...style,
  };

  return (
    <span
      className={[
        "inline-flex items-center",
        "rounded-full border",
        "px-2.5 py-1",
        "text-xs font-semibold",
        "leading-none",
        className,
      ].join(" ")}
      style={badgeStyle}
      {...props}
    />
  );
}
