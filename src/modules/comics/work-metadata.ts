export const workTypeLabels = {
  UNKNOWN: "Тип не указан", MANGA: "Манга", MANHWA: "Манхва", MANHUA: "Маньхуа", COMIC: "Комикс", OTHER: "Другое",
} as const;
export const workFormatLabels = {
  UNKNOWN: "Формат не указан", PAGED: "Страничный", WEBTOON: "Вебтун (вертикальный)", OTHER: "Другой формат",
} as const;
export type WorkType = keyof typeof workTypeLabels;
export type WorkFormat = keyof typeof workFormatLabels;
export function isWorkType(value: unknown): value is WorkType {
  return typeof value === "string" && Object.hasOwn(workTypeLabels, value);
}
export function isWorkFormat(value: unknown): value is WorkFormat {
  return typeof value === "string" && Object.hasOwn(workFormatLabels, value);
}
