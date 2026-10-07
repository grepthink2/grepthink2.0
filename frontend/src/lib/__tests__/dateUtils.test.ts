import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { DATETIME_FORMAT } from '@/features/app/components/Fields/DatePickerField';
import {
  assignmentClosesAt,
  assignmentDeadline,
  assignmentOpensAt,
  assignmentStatus,
  formatAssignmentDueDate,
  formatDeadline,
  formatInstant,
  pickerTextToIso,
  startOfDayIn,
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

describe('dateUtils — the opening instant', () => {
  it('startOfDayIn is midnight in the named zone', () => {
    expect(startOfDayIn('America/Los_Angeles', '2026-10-05').toISOString()).toBe('2026-10-05T07:00:00.000Z');
    expect(startOfDayIn('Europe/Istanbul', '2026-10-05').toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });

  it('startOfDayIn takes the offset in force at midnight on the day DST ends', () => {
    expect(startOfDayIn('America/Los_Angeles', '2026-11-01').toISOString()).toBe('2026-11-01T07:00:00.000Z'); // still PDT
    expect(startOfDayIn('America/Los_Angeles', '2026-11-02').toISOString()).toBe('2026-11-02T08:00:00.000Z');
  });

  it('startOfDayIn agrees with the server where the clocks change at midnight', () => {
    // The Azores spring from 00:00 to 01:00 and fall back from 01:00 to 00:00. The server
    // (zoneinfo, fold=0) opens at the day's first moment: the change itself, then the first 00:00.
    expect(startOfDayIn('Atlantic/Azores', '2026-03-29').toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(startOfDayIn('Atlantic/Azores', '2026-10-25').toISOString()).toBe('2026-10-25T00:00:00.000Z');
  });

  it("assignmentOpensAt opens at midnight in the school's zone", () => {
    const a = { open_date: '2026-10-05', close_date: '2026-10-07' };
    expect(assignmentOpensAt(a, 'Europe/Istanbul')?.toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });
});

describe('dateUtils — assignment status', () => {
  const PUBLISHED = {
    open_date: '2026-10-05',
    close_date: '2026-10-12',
    due_at: '2026-10-13T07:00:00+00:00',
    status: 'publish',
  };

  it('keeps a draft a draft, whatever the time', () => {
    expect(assignmentStatus({ ...PUBLISHED, status: 'draft' }, new Date('2026-10-20T12:00:00Z'))).toBe('draft');
  });

  it('is active before the deadline and closed from that moment', () => {
    expect(assignmentStatus(PUBLISHED, new Date('2026-10-13T06:59:59Z'))).toBe('active');
    expect(assignmentStatus(PUBLISHED, new Date('2026-10-13T07:00:00Z'))).toBe('closed');
  });

  it('stays active inside the late window', () => {
    const late = { ...PUBLISHED, accept_until: '2026-10-22T06:59:00+00:00' };
    expect(assignmentStatus(late, new Date('2026-10-20T12:00:00Z'))).toBe('active');
  });

  it('is closed once the late window has ended', () => {
    const late = { ...PUBLISHED, accept_until: '2026-10-22T06:59:00+00:00' };
    expect(assignmentStatus(late, new Date('2026-10-22T06:59:00Z'))).toBe('closed');
  });

  it('uses 11:59 PM Pacific on close_date when due_at is missing', () => {
    const legacy = { open_date: '2026-10-05', close_date: '2026-10-12', status: 'publish' };
    expect(assignmentStatus(legacy, new Date('2026-10-13T06:58:59Z'))).toBe('active');
    expect(assignmentStatus(legacy, new Date('2026-10-13T06:59:00Z'))).toBe('closed');
  });
});

describe('dateUtils — picker text', () => {
  it('reads complete picker text as the viewer\'s local time', () => {
    expect(pickerTextToIso('2026-10-22 23:59')).toBe(new Date(2026, 9, 22, 23, 59).toISOString());
  });

  it('reads the date picker\'s own format', () => {
    const when = new Date(2026, 9, 7, 9, 5);
    expect(pickerTextToIso(format(when, DATETIME_FORMAT))).toBe(when.toISOString());
  });

  it('returns null for incomplete or malformed text', () => {
    expect(pickerTextToIso('2026-10-22 ')).toBeNull();
    expect(pickerTextToIso('2026-10-22 2:')).toBeNull();
  });
});
