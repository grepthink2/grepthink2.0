import { describe, expect, it } from 'vitest';
import type { ApiScheduleItem, ApiScheduleLens } from '@/lib/api';
import { deadlineHref, toScheduleItem, toScheduleItems } from '../scheduleApi';

const deadline = (type: string | null): ApiScheduleItem => ({
  id: 'deadline:a1',
  kind: 'deadline',
  title: 'TSR 4 due',
  starts_at: '2026-11-14T07:59:00+00:00',
  ends_at: null,
  all_day: false,
  assignment_id: 'a1',
  assignment_type: type,
});

describe('deadlineHref', () => {
  it.each<[ApiScheduleLens, string | null, string | undefined]>([
    ['student', 'tsr', '/app/assignments/a1'],
    ['student', 'interest_form', '/app/assignments/a1'],
    ['ta', 'tsr', '/app/ta-review/a1'],
    ['ta', 'feedback', '/app/ta-review/a1'],
    ['instructor', 'tsr', '/app/modules/tsr/a1'],
    ['instructor', 'feedback', '/app/modules/feedback/a1'],
    ['instructor', 'interest_form', undefined],
    ['instructor', null, undefined],
  ])('links a %s to a %s deadline at %s', (lens, type, href) => {
    expect(deadlineHref(lens, deadline(type))).toBe(href);
  });
});

describe('toScheduleItem', () => {
  it('maps a TA meeting, its TA and the attendance', () => {
    const got = toScheduleItem('ta', {
      id: 'ta_meeting:s1:2026-11-10',
      kind: 'ta_meeting',
      title: 'TA meeting',
      starts_at: '2026-11-10T23:00:00+00:00',
      ends_at: '2026-11-10T23:30:00+00:00',
      all_day: false,
      project_id: 'p1',
      team_name: 'Alpha',
      location: null,
      zoom_url: 'https://zoom.example/1',
      host: { id: 'ta', name: 'Tara Lee', avatar_url: null, you: true, role: 'TA' },
      recurrence_label: 'Weekly · Tue',
      meeting_index: 2,
      meetings_per_week: 2,
      attendance: { present: 3, total: 4 },
    });
    expect(got).toEqual({
      id: 'ta_meeting:s1:2026-11-10',
      kind: 'ta_meeting',
      title: 'TA meeting',
      startsAt: '2026-11-10T23:00:00+00:00',
      endsAt: '2026-11-10T23:30:00+00:00',
      allDay: false,
      projectId: 'p1',
      teamName: 'Alpha',
      zoomUrl: 'https://zoom.example/1',
      host: { id: 'ta', name: 'Tara Lee', you: true, role: 'TA' },
      recurrenceLabel: 'Weekly · Tue',
      meetingIndex: 2,
      meetingsPerWeek: 2,
      attendance: { present: 3, total: 4 },
    });
  });

  it('maps a final review with both reviewers', () => {
    const got = toScheduleItem('student', {
      id: 'final_review:p1',
      kind: 'final_review',
      title: 'Final review',
      starts_at: '2026-11-12T22:00:00+00:00',
      ends_at: '2026-11-12T23:00:00+00:00',
      all_day: false,
      project_id: 'p1',
      team_name: 'Alpha',
      zoom_url: null,
      reviewers: [
        { id: 'ta', name: 'Tara Lee', avatar_url: 'https://img/ta.png', you: false, slot: 'home' },
        { id: 'ta2', name: 'Theo Lee', avatar_url: null, you: false, slot: 'review' },
      ],
    });
    expect(got.reviewers).toEqual([
      { id: 'ta', name: 'Tara Lee', avatarUrl: 'https://img/ta.png', you: false, slot: 'home' },
      { id: 'ta2', name: 'Theo Lee', you: false, slot: 'review' },
    ]);
    expect(got.zoomUrl).toBeUndefined();
  });

  it('maps a team meeting with its note and scope, and a sprint edge as all-day', () => {
    expect(
      toScheduleItem('student', {
        id: 'meeting:m1',
        kind: 'meeting',
        title: 'Sprint planning',
        starts_at: '2026-11-11T02:00:00+00:00',
        ends_at: '2026-11-11T03:00:00+00:00',
        all_day: false,
        location: 'BE 312',
        note: 'Bring the backlog',
        scope: 'team',
      }),
    ).toMatchObject({ location: 'BE 312', note: 'Bring the backlog', scope: 'team' });
    expect(
      toScheduleItem('student', {
        id: 'sprint:x:start',
        kind: 'sprint',
        title: 'Sprint 4',
        starts_at: '2026-11-09T08:00:00+00:00',
        ends_at: null,
        all_day: true,
        sprint: { name: 'Sprint 4', edge: 'start' },
      }),
    ).toEqual({
      id: 'sprint:x:start',
      kind: 'sprint',
      title: 'Sprint 4',
      startsAt: '2026-11-09T08:00:00+00:00',
      endsAt: null,
      allDay: true,
      sprint: { name: 'Sprint 4', edge: 'start' },
    });
  });

  it('links a deadline for the lens the answer names', () => {
    expect(toScheduleItems({ lens: 'ta', items: [deadline('tsr')] })).toEqual([
      {
        id: 'deadline:a1',
        kind: 'deadline',
        title: 'TSR 4 due',
        startsAt: '2026-11-14T07:59:00+00:00',
        endsAt: null,
        allDay: false,
        href: '/app/ta-review/a1',
      },
    ]);
  });
});
