/** A DatePickerField value without a time (a date-fns format string). */
export const DATE_ONLY_FORMAT = 'yyyy-MM-dd';
/** A DatePickerField value with `showTime`. */
export const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm';

const VALUE = /^(\d{4})-(\d{2})-(\d{2})(?: ([01]\d|2[0-3]):([0-5]\d)| ?)$/;

/**
 * A DatePickerField value as a local date and its 'HH:mm' time ('' when it has none): 'yyyy-MM-dd',
 * 'yyyy-MM-dd HH:mm', or a date whose time was cleared ('yyyy-MM-dd '). Null for '' and anything else,
 * a day that does not exist included. The date is local, so a date-only value never shifts across
 * time zones.
 */
export function parseDateValue(value: string): { date: Date; time: string } | null {
  const m = VALUE.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return { date, time: m[4] ? `${m[4]}:${m[5]}` : '' };
}

/** '15:00' → '3:00 PM'. */
export function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
