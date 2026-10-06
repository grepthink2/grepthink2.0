import { describe, expect, it } from 'vitest';
import {
  assignmentClosesAt,
  assignmentDeadline,
  assignmentOpensAt,
  formatAssignmentDueDate,
  formatDeadline,
  formatInstant,
  toLA2359,
} from '@/lib/dateUtils';

describe('dateUtils — deadlines', () => {
  it('uses due_at when the backend sends it', () => {
    const a = { open_date: '2026-10-05', close_date: '2026-10-07', due_at: '2026-10-08T07:00:00+00:00' };
    expect(assignmentDeadline(a)?.toISOString()).toBe('2026-10-08T07:00:00.000Z');
  });

  it('falls back to 11:59 PM Pacific on close_date for an older backend', () => {
    const a = { open_date: '2026-10-05', close_date: '2026-10-07' };
    expect(assignmentDeadline(a)?.getTime()).toBe(toLA2359('2026-10-07').getTime());
    expect(formatDeadline(a)).toBe(formatAssignmentDueDate('2026-10-07'));
  });

  it('shows the backend deadline one minute early, as the 11:59 PM label students know', () => {
    const pacific = { open_date: '2026-10-05', close_date: '2026-10-07', due_at: '2026-10-08T07:00:00+00:00' };
    expect(formatDeadline(pacific)).toBe(formatAssignmentDueDate('2026-10-07'));
    // A school in another zone (Istanbul, UTC+3): the label follows due_at, not the Pacific rule.
    const istanbul = { ...pacific, due_at: '2026-10-07T21:00:00+00:00' };
    expect(formatDeadline(istanbul)).toBe(formatInstant('2026-10-07T20:59:00Z'));
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
