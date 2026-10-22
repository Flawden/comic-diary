export const themes = {
  night: {
    id: "night",
    label: "Night Reader",
  },
  paper: {
    id: "paper",
    label: "Paper Journal",
  },
  tea: {
    id: "tea",
    label: "Tea House",
  },
} as const;

export type ThemeId =
  keyof typeof themes;

export const THEME_COOKIE = "comic-diary-theme";

export function resolveTheme(value: string | undefined): ThemeId {
  return value === "night" || value === "tea" ? value : "paper";
}
