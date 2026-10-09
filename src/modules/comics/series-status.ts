export const seriesStatusLabels = {
  UNKNOWN: "Статус выпуска неизвестен", ONGOING: "Выходит", FINISHED: "Завершён",
  HIATUS: "На паузе", CANCELLED: "Выпуск прекращён",
} as const;
export type SeriesStatus = keyof typeof seriesStatusLabels;
export function isSeriesStatus(value: unknown): value is SeriesStatus {
  return typeof value === "string" && Object.hasOwn(seriesStatusLabels, value);
}
export function caughtUpLabel(status: SeriesStatus) {
  return status === "ONGOING" ? "Всё вышедшее прочитано · Жду продолжения"
    : status === "FINISHED" ? "Все вышедшие основные главы прочитаны"
    : status === "HIATUS" ? "Всё вышедшее прочитано · Выпуск на паузе"
    : status === "CANCELLED" ? "Всё вышедшее прочитано · Выпуск прекращён"
    : "Всё вышедшее прочитано · Статус выпуска неизвестен";
}
