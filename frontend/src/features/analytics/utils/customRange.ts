/**
 * The custom range rules the backend applies (backend/app/analytics/windows.py), checked before Apply so a range it
 * would refuse with a 422 never reaches the URL. Dates are ISO calendar dates, compared as strings.
 */
const MIN_DATE = '2000-01-01';
const MAX_DATE = '2100-12-31';
const MAX_SPAN_YEARS = 2;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The same calendar date `years` later; Feb 29 lands on Feb 28 when that year has none (windows.years_after). */
export function yearsAfter(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const year = y + years;
  const day = m === 2 && d === 29 && !isLeapYear(year) ? 28 : d;
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The rule a custom range breaks, as the line shown under its fields; null when the backend would take it (or a field is still empty). */
export function customRangeProblem(from: string, to: string): string | null {
  const outside = (date: string) => date !== '' && (date < MIN_DATE || date > MAX_DATE);
  if (outside(from) || outside(to)) return 'Dates must fall between 2000 and 2100';
  if (from === '' || to === '') return null;
  if (to < from) return 'To must be on or after From';
  if (to > yearsAfter(from, MAX_SPAN_YEARS)) return 'A range may span at most 2 years';
  return null;
}
