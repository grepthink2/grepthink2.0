import { describe, expect, it } from 'vitest';
import type { ApiProjectMeeting } from '@/lib/api';
import { toProjectMeetingPayload, toTeamMeeting } from '../teamMeetingRows';

const row: ApiProjectMeeting = {
  id: 'm1',
  project_id: 'p1',
  title: 'Design review',
  starts_at: '2026-10-22T22:00:00+00:00',
  duration_minutes: 45,
  location: 'E2 room 180',
  zoom_url: 'https://ucsc.zoom.us/j/1',
  note: 'Bring the demo',
  created_by: 'u-po',
  updated_at: '2026-10-18T09:00:00+00:00',
};

describe('toTeamMeeting', () => {
  it('turns an API row into the UI’s meeting', () => {
    expect(toTeamMeeting(row)).toEqual({
      id: 'm1',
      projectId: 'p1',
      title: 'Design review',
      startsAt: '2026-10-22T22:00:00+00:00',
      durationMinutes: 45,
      location: 'E2 room 180',
      zoomUrl: 'https://ucsc.zoom.us/j/1',
      note: 'Bring the demo',
      createdBy: 'u-po',
      updatedAt: '2026-10-18T09:00:00+00:00',
    });
  });

  it('keeps empty fields empty and drops a creator whose profile is gone', () => {
    const meeting = toTeamMeeting({ ...row, location: null, zoom_url: null, note: null, created_by: null });
    expect(meeting.location).toBeNull();
    expect(meeting.zoomUrl).toBeNull();
    expect(meeting.note).toBeNull();
    expect(meeting.createdBy).toBeUndefined();
  });
});

describe('toProjectMeetingPayload', () => {
  it('turns the form’s payload into the request body', () => {
    expect(
      toProjectMeetingPayload({
        title: 'Retro',
        startsAt: '2026-10-23T16:30:00.000Z',
        durationMinutes: 60,
        location: null,
        zoomUrl: 'https://ucsc.zoom.us/j/2',
        note: null,
      }),
    ).toEqual({
      title: 'Retro',
      starts_at: '2026-10-23T16:30:00.000Z',
      duration_minutes: 60,
      location: null,
      zoom_url: 'https://ucsc.zoom.us/j/2',
      note: null,
    });
  });
});
