import { describe, expect, it } from 'vitest';
import { customRangeProblem, yearsAfter } from '../customRange';

describe('customRange', () => {
  it('moves a date by whole calendar years, Feb 29 landing on Feb 28 as the backend does', () => {
    expect(yearsAfter('2026-09-01', 2)).toBe('2028-09-01');
    expect(yearsAfter('2024-02-29', 2)).toBe('2026-02-28');
    expect(yearsAfter('2024-02-29', 4)).toBe('2028-02-29');
  });
  it('accepts what the backend accepts', () => {
    expect(customRangeProblem('2026-09-01', '2026-09-30')).toBeNull();
    expect(customRangeProblem('2026-09-01', '2026-09-01')).toBeNull();
    expect(customRangeProblem('2023-01-01', '2025-01-01')).toBeNull(); // exactly two years
    expect(customRangeProblem('2024-02-29', '2026-02-28')).toBeNull();
    expect(customRangeProblem('2000-01-01', '2001-12-31')).toBeNull();
    expect(customRangeProblem('2099-06-01', '2100-12-31')).toBeNull();
    expect(customRangeProblem('', '')).toBeNull(); // nothing picked yet: the empty fields say so
  });
  it('names the rule a refused range breaks', () => {
    expect(customRangeProblem('1999-12-31', '2000-01-10')).toBe('Dates must fall between 2000 and 2100');
    expect(customRangeProblem('2100-06-01', '2101-01-01')).toBe('Dates must fall between 2000 and 2100');
    expect(customRangeProblem('1999-12-31', '')).toBe('Dates must fall between 2000 and 2100'); // before To is picked
    expect(customRangeProblem('2026-09-20', '2026-09-10')).toBe('To must be on or after From');
    expect(customRangeProblem('2023-01-01', '2025-01-02')).toBe('A range may span at most 2 years');
    expect(customRangeProblem('2024-02-29', '2026-03-01')).toBe('A range may span at most 2 years');
  });
});
