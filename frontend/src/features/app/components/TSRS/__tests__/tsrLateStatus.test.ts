import { describe, expect, it } from 'vitest';
import { tsrLateStatus } from '../tsrLateStatus';

const DUE_AT = '2026-11-15T08:00:00Z';

describe('tsrLateStatus', () => {
  it('marks a TSR first submitted at or after the deadline late, as the server counts it', () => {
    expect(tsrLateStatus({ submitted_at: DUE_AT, updated_at: DUE_AT }, DUE_AT)).toBe('tsr.late');
    expect(tsrLateStatus({ submitted_at: '2026-11-16T01:00:00Z', updated_at: '2026-11-17T01:00:00Z' }, DUE_AT)).toBe(
      'tsr.late',
    );
  });

  it('marks a TSR submitted on time and saved again at or after the deadline edited late', () => {
    expect(tsrLateStatus({ submitted_at: '2026-11-14T20:00:00Z', updated_at: DUE_AT }, DUE_AT)).toBe('tsr.edited_late');
    expect(tsrLateStatus({ submitted_at: '2026-11-14T20:00:00Z', updated_at: '2026-11-15T09:00:00Z' }, DUE_AT)).toBe(
      'tsr.edited_late',
    );
  });

  it('leaves a TSR submitted and saved before the deadline unmarked', () => {
    expect(tsrLateStatus({ submitted_at: '2026-11-14T20:00:00Z', updated_at: '2026-11-15T07:59:59Z' }, DUE_AT)).toBeNull();
  });

  it('compares instants, whatever offset each time is written with', () => {
    // 00:30 at UTC-8 is 08:30 UTC, after the deadline; 09:59 at UTC+2 is 07:59 UTC, before it.
    expect(tsrLateStatus({ submitted_at: '2026-11-15T00:30:00-08:00' }, DUE_AT)).toBe('tsr.late');
    expect(tsrLateStatus({ submitted_at: '2026-11-15T09:59:00+02:00' }, DUE_AT)).toBeNull();
    expect(tsrLateStatus({ submitted_at: '2026-11-14T20:00:00Z' }, '2026-11-15T00:00:00-08:00')).toBeNull();
  });

  it('marks nothing without a deadline', () => {
    const late = { submitted_at: '2026-11-16T01:00:00Z', updated_at: '2026-11-16T01:00:00Z' };
    expect(tsrLateStatus(late, null)).toBeNull();
    expect(tsrLateStatus(late, undefined)).toBeNull();
    expect(tsrLateStatus(late, 'not a time')).toBeNull();
  });

  it('never marks a TSR late on a missing or unreadable time', () => {
    expect(tsrLateStatus({}, DUE_AT)).toBeNull();
    expect(tsrLateStatus({ submitted_at: null, updated_at: null }, DUE_AT)).toBeNull();
    expect(tsrLateStatus({ submitted_at: 'garbage', updated_at: 'garbage' }, DUE_AT)).toBeNull();
    expect(tsrLateStatus({ submitted_at: '2026-11-14T20:00:00Z', updated_at: null }, DUE_AT)).toBeNull();
    // Without its submission time an entry is not marked, even one saved after the deadline.
    expect(tsrLateStatus({ submitted_at: null, updated_at: '2026-11-16T01:00:00Z' }, DUE_AT)).toBeNull();
    expect(tsrLateStatus({ submitted_at: 'garbage', updated_at: '2026-11-16T01:00:00Z' }, DUE_AT)).toBeNull();
  });
});
