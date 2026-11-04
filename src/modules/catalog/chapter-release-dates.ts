/** Expected publication dates have explicit precision: year, month, or day.
 * A month/year is NOT stored as the first day of that month.
 */
export function isValidExpectedRelease(value: string): boolean {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  if (year < 1 || year > 9999) return false;
  if (monthText === undefined) return true;
  const month = Number(monthText);
  if (month < 1 || month > 12) return false;
  if (dayText === undefined) return true;
  const day = Number(dayText);
  // Validate real calendar days, including leap years.
  const february = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  const max = [31, february, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= max;
}

export type ExpectedReleasePrecision = "NONE" | "YEAR" | "MONTH" | "DAY";

export function expectedReleasePrecision(value: string | null): ExpectedReleasePrecision {
  if (!value) return "NONE";
  if (value.length === 4) return "YEAR";
  if (value.length === 7) return "MONTH";
  return "DAY";
}

const months = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export function formatExpectedRelease(value: string): string {
  if (!isValidExpectedRelease(value)) return "Дата неизвестна";
  const [year, month, day] = value.split("-");
  if (!month) return `${year} г.`;
  if (!day) return `${months[Number(month) - 1]} ${year} г.`;
  return `${day}.${month}.${year}`;
}

/** Display the stored UTC calendar date; do not shift a date-only fact by browser timezone. */
export function formatReleasedAt(value: string): string {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
    : "Дата неизвестна";
}
