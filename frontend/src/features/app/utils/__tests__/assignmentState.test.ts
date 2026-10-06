import { describe, expect, it } from 'vitest';
import { resolveAssignmentState } from '../assignmentState';

const A = { open_date: '2026-10-05', close_date: '2026-10-07', due_at: '2026-10-08T07:00:00+00:00' };

describe('resolveAssignmentState', () => {
  it('opens later before the open day and closes at the deadline instant', () => {
    expect(resolveAssignmentState(A, new Date('2026-10-04T12:00:00Z'), false, true).action).toBe('opens_later');
    expect(resolveAssignmentState(A, new Date('2026-10-08T06:59:00Z'), false, true).action).toBe('start');
    expect(resolveAssignmentState(A, new Date('2026-10-08T07:00:00Z'), false, true).action).toBe('closed');
  });

  it('stays open inside the late window and reports it', () => {
    const late = { ...A, accept_until: '2026-10-10T07:00:00+00:00' };
    const state = resolveAssignmentState(late, new Date('2026-10-09T12:00:00Z'), false, true);
    expect(state.action).toBe('start');
    expect(state.lateUntil?.toISOString()).toBe('2026-10-10T07:00:00.000Z');
    expect(resolveAssignmentState(late, new Date('2026-10-10T07:00:00Z'), false, true).action).toBe('closed');
  });

  it('keeps the submitted and cannot-start rules', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    expect(resolveAssignmentState(A, now, true, true)).toMatchObject({ status: 'submitted', action: 'edit_submission' });
    expect(resolveAssignmentState(A, now, false, false).action).toBe('closed');
  });

  it('falls back to the Pacific day rule without due_at', () => {
    const legacy = { open_date: '2026-10-05', close_date: '2026-10-07' };
    expect(resolveAssignmentState(legacy, new Date('2026-10-08T06:58:00Z'), false, true).action).toBe('start');
    expect(resolveAssignmentState(legacy, new Date('2026-10-08T07:00:00Z'), false, true).action).toBe('closed');
  });

  it("opens at midnight in the school's zone", () => {
    const istanbul = { ...A, due_at: '2026-10-07T21:00:00+00:00' };
    expect(resolveAssignmentState(istanbul, new Date('2026-10-04T20:59:00Z'), false, true, 'Europe/Istanbul').action).toBe('opens_later');
    expect(resolveAssignmentState(istanbul, new Date('2026-10-04T21:00:00Z'), false, true, 'Europe/Istanbul').action).toBe('start');
  });
});
