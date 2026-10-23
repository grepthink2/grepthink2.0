import { describe, expect, it } from 'vitest';
import { DATE_ONLY_FORMAT, DATETIME_FORMAT, formatClock, parseDateValue } from '../dateFormats';

describe('dateFormats', () => {
  it('names the two value formats', () => {
    expect(DATE_ONLY_FORMAT).toBe('yyyy-MM-dd');
    expect(DATETIME_FORMAT).toBe('yyyy-MM-dd HH:mm');
  });

  it('reads a date value as a local day with no time', () => {
    const parsed = parseDateValue('2026-10-20');
    expect(parsed?.time).toBe('');
    expect(parsed?.date.getFullYear()).toBe(2026);
    expect(parsed?.date.getMonth()).toBe(9);
    expect(parsed?.date.getDate()).toBe(20);
    expect(parsed?.date.getHours()).toBe(0);
  });

  it('reads a date and time value, and a date whose time was cleared', () => {
    expect(parseDateValue('2026-11-02 15:00')?.time).toBe('15:00');
    const cleared = parseDateValue('2026-10-22 ');
    expect(cleared?.date.getDate()).toBe(22);
    expect(cleared?.time).toBe('');
  });

  it('refuses anything else, and days that do not exist', () => {
    for (const value of ['', 'Oct 20', '2026-10-20T15:00', '2026-13-01', '2026-02-30', '2026-10-20 24:00', '2026-10-20 9:00']) {
      expect(parseDateValue(value)).toBeNull();
    }
  });

  it('formats a 24-hour time on a 12-hour clock', () => {
    expect(formatClock('00:00')).toBe('12:00 AM');
    expect(formatClock('08:05')).toBe('8:05 AM');
    expect(formatClock('12:30')).toBe('12:30 PM');
    expect(formatClock('23:59')).toBe('11:59 PM');
  });
});
