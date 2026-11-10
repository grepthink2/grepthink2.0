/**
 * Midnight in a zone, with no date library: Home's schedule card needs it, and lib/dateUtils (which
 * re-exports it) would bring date-fns into the entry chunk.
 */

const DAY_MS = 86_400_000;

/** Midnight at the start of `dateStr` (YYYY-MM-DD) in the IANA zone `zone`, as a UTC instant. */
export function startOfDayIn(zone: string, dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  // The zone's UTC offset at an instant: its wall clock read as if it were UTC, minus the instant.
  const offsetAt = (instant: number): number => {
    const parts = clock.formatToParts(instant);
    const field = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)!.value);
    const wall = Date.UTC(
      field('year'), field('month') - 1, field('day'), field('hour') % 24, field('minute'), field('second'),
    );
    return wall - instant;
  };
  // 00:00 that day written as if it were UTC, then read with the offset in force before the day
  // and, when the clocks have changed by then, with the one after it. The offset at another hour
  // of the day is not enough: a daylight-saving change between midnight and that hour shifts it.
  const wall = Date.UTC(year, month - 1, day);
  const before = offsetAt(wall - DAY_MS);
  const early = wall - before;
  if (offsetAt(early) === before) return new Date(early);
  const after = offsetAt(wall + DAY_MS);
  const late = wall - after;
  // Where the clocks skip midnight neither reading is on the zone's clock; the earlier offset
  // lands on the change itself, the day's first moment, as on the server (zoneinfo, fold=0).
  return new Date(offsetAt(late) === after ? late : early);
}
