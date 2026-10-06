import { describe, expect, it } from 'vitest';
import {
  assignmentClosesAt,
  assignmentDeadline,
  assignmentOpensAt,
  formatAssignmentDueDate,
  formatDeadline,
  formatInstant,
} from '@/lib/dateUtils';

describe('dateUtils — deadlines', () => {
  it('uses due_at when the backend sends it', () => {
    const a = { open_date: '2026-10-05', close_date: '2026-10-07', due_at: '2026-10-08T07:00:00+00:00' };
    expect(assignmentDeadline(a)?.toISOString()).toBe('2026-10-08T07:00:00.000Z');
  });

  it('falls back to 11:59 PM Pacific on close_date for an older backend', () => {
    const a = { open_date: '2026-10-05', close_date: '2026-10-07' };
    expect(assignmentDeadline(a)?.toISOString()).toBe('2026-10-08T06:59:00.000Z');
    expect(formatDeadline(a)).toBe(formatAssignmentDueDate('2026-10-07'));
  });

  it('pins the Pacific rule on both DST days with literal instants', () => {
    // Legacy deadline: 11:59 PM Pacific = 07:59Z in PST, 06:59Z in PDT.
    const legacy = (close_date: string) => assignmentDeadline({ open_date: '2026-01-01', close_date })?.toISOString();
    expect(legacy('2026-01-12')).toBe('2026-01-13T07:59:00.000Z'); // PST
    expect(legacy('2026-03-08')).toBe('2026-03-09T06:59:00.000Z'); // the day DST starts
    expect(legacy('2026-11-01')).toBe('2026-11-02T07:59:00.000Z'); // the day DST ends
    // Opening instant: midnight Pacific = 08:00Z in PST, 07:00Z in PDT.
    const opens = (open_date: string) => assignmentOpensAt({ open_date, close_date: '2026-12-31' })?.toISOString();
    expect(opens('2026-03-08')).toBe('2026-03-08T08:00:00.000Z');
    expect(opens('2026-03-09')).toBe('2026-03-09T07:00:00.000Z');
    expect(opens('2026-11-01')).toBe('2026-11-01T07:00:00.000Z');
    expect(opens('2026-11-02')).toBe('2026-11-02T08:00:00.000Z');
  });

  it('shows the backend deadline one minute early, as the 11:59 PM label students know', () => {
    const pacific = { open_date: '2026-10-05', close_date: '2026-10-07', due_at: '2026-10-08T07:00:00+00:00' };
    expect(formatDeadline(pacific)).toBe(formatAssignmentDueDate('2026-10-07'));
    // A school in another zone (Istanbul, UTC+3): the label follows due_at, not the Pacific rule.
    const istanbul = { ...pacific, due_at: '2026-10-07T21:00:00+00:00' };
    expect(formatDeadline(istanbul)).toBe(formatInstant('2026-10-07T20:59:00Z'));
  });

  it('formatDeadline shows the deadline, never the late window', () => {
    const a = {
      open_date: '2026-10-05', close_date: '2026-10-07',
      due_at: '2026-10-08T07:00:00+00:00', accept_until: '2026-10-10T07:00:00+00:00',
    };
    expect(formatDeadline(a)).toBe(formatDeadline({ ...a, accept_until: null }));
  });

  it('closes at the late window when there is one', () => {
    const a = {
      open_date: '2026-10-05', close_date: '2026-10-07',
      due_at: '2026-10-08T07:00:00+00:00', accept_until: '2026-10-10T07:00:00+00:00',
    };
    expect(assignmentClosesAt(a)?.toISOString()).toBe('2026-10-10T07:00:00.000Z');
    expect(assignmentClosesAt({ ...a, accept_until: null })?.toISOString()).toBe('2026-10-08T07:00:00.000Z');
  });

  it('opens at the start of the open day in Pacific time when the backend sends no instant', () => {
    const opens = assignmentOpensAt({ open_date: '2026-10-05', close_date: '2026-10-07' });
    expect(opens?.toISOString()).toBe('2026-10-05T07:00:00.000Z');
  });

  it('answers null without a close date', () => {
    expect(assignmentDeadline({ open_date: '2026-10-05', close_date: '' })).toBeNull();
    expect(assignmentClosesAt({ open_date: '2026-10-05', close_date: '', due_at: null })).toBeNull();
  });
});
