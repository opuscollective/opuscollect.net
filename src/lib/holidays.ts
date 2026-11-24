/**
 * The holidays the "Closed on holidays" switch covers (United States, the Birmingham pilot). Actual dates, not observed days.
 * Pure and dependency-free so it runs in the Worker and the browser, and tests can check it.
 */
export const HOLIDAY_NAMES = ['New Year’s Day', 'Martin Luther King Jr. Day', 'Memorial Day', 'Juneteenth', 'Independence Day', 'Labor Day', 'Thanksgiving', 'Christmas Eve', 'Christmas Day'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** The nth (1-based) given weekday (0 = Sunday) of a month, or the last one when n = -1. */
function nth(year: number, month: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, dim)).getUTCDay();
  return dim - ((last - weekday + 7) % 7);
}

export function holidaysInYear(y: number): { day: string; name: string }[] {
  return [
    { day: ymd(y, 1, 1), name: HOLIDAY_NAMES[0]! },
    { day: ymd(y, 1, nth(y, 1, 1, 3)), name: HOLIDAY_NAMES[1]! },
    { day: ymd(y, 5, nth(y, 5, 1, -1)), name: HOLIDAY_NAMES[2]! },
    { day: ymd(y, 6, 19), name: HOLIDAY_NAMES[3]! },
    { day: ymd(y, 7, 4), name: HOLIDAY_NAMES[4]! },
    { day: ymd(y, 9, nth(y, 9, 1, 1)), name: HOLIDAY_NAMES[5]! },
    { day: ymd(y, 11, nth(y, 11, 4, 4)), name: HOLIDAY_NAMES[6]! },
    { day: ymd(y, 12, 24), name: HOLIDAY_NAMES[7]! },
    { day: ymd(y, 12, 25), name: HOLIDAY_NAMES[8]! },
  ];
}

/** Holidays from `from` (YYYY-MM-DD) up to about `months` months ahead. */
export function upcomingHolidays(from: string, months = 13): { day: string; name: string }[] {
  const y = Number(from.slice(0, 4));
  const end = ymd(y + Math.floor((Number(from.slice(5, 7)) - 1 + months) / 12), ((Number(from.slice(5, 7)) - 1 + months) % 12) + 1, Number(from.slice(8, 10)));
  return [y, y + 1, y + 2].flatMap(holidaysInYear).filter((h) => h.day >= from && h.day <= end);
}
