import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEAM_MEETING_DEFAULT_DURATION,
  TEAM_MEETING_DURATIONS,
  TEAM_MEETING_NOTE_MAX,
  TEAM_MEETING_TITLE_MAX,
  campusTimeOf,
  draftFrom,
  endsAtOf,
  fmtMeetingWhen,
  fmtMinutes,
  instantToZoned,
  isHttpUrl,
  isLive,
  isPast,
  isoMinutes,
  showTeamMeetingsCard,
  splitMeetings,
  toScheduleItem,
  validateTeamMeeting,
  zonedToInstant,
  type TeamMeeting,
  type TeamMeetingDraft,
} from '../teamMeetingsModel';

const LA = 'America/Los_Angeles';
const IST = 'Asia/Kolkata';
const ISTANBUL = 'Europe/Istanbul';

/** Make `zone` the browser's own zone, which the model reads when it is not told one. */
function viewerIn(zone: string) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: zone } as Intl.ResolvedDateTimeFormatOptions);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Tue Oct 20, 2026, 3:12 PM PT: the clock the design's demo is pinned to. */
const NOW = new Date('2026-10-20T22:12:00Z');

const meeting = (over: Partial<TeamMeeting> = {}): TeamMeeting => ({
  id: 'm1',
  projectId: 'p1',
  title: 'Sprint 3 planning',
  startsAt: '2026-10-20T22:00:00Z',
  durationMinutes: 60,
  ...over,
});

const draft = (over: Partial<TeamMeetingDraft> = {}): TeamMeetingDraft => ({
  title: 'Design review',
  date: '2026-10-22',
  time: '15:00',
  durationMinutes: 60,
  location: '',
  zoomUrl: '',
  note: '',
  ...over,
});

describe('limits', () => {
  it('holds the spec’s limits and the 15-minute duration steps', () => {
    expect(TEAM_MEETING_TITLE_MAX).toBe(80);
    expect(TEAM_MEETING_NOTE_MAX).toBe(500);
    expect(TEAM_MEETING_DEFAULT_DURATION).toBe(60);
    expect(TEAM_MEETING_DURATIONS).toEqual([15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240]);
  });
});

describe('durations and the end of a meeting', () => {
  it('writes a duration for the list and for the <time> element', () => {
    expect(fmtMinutes(45)).toBe('45 min');
    expect(fmtMinutes(60)).toBe('1 h');
    expect(fmtMinutes(75)).toBe('1 h 15 min');
    expect(fmtMinutes(240)).toBe('4 h');
    expect(isoMinutes(45)).toBe('PT45M');
    expect(isoMinutes(60)).toBe('PT1H');
    expect(isoMinutes(75)).toBe('PT1H15M');
    expect(isoMinutes(240)).toBe('PT4H');
  });

  it('ends a meeting its duration after the start, as an ISO instant', () => {
    expect(endsAtOf(meeting())).toBe('2026-10-20T23:00:00.000Z');
    expect(endsAtOf(meeting({ startsAt: '2026-10-20T15:00:00-07:00', durationMinutes: 90 }))).toBe('2026-10-20T23:30:00.000Z');
    expect(endsAtOf(meeting({ durationMinutes: 0 }))).toBe('2026-10-20T22:00:00.000Z');
  });

  it('is live from the start up to, not including, the end', () => {
    const at = (iso: string) => new Date(iso);
    expect(isLive(meeting(), at('2026-10-20T21:59:59Z'))).toBe(false);
    expect(isLive(meeting(), at('2026-10-20T22:00:00Z'))).toBe(true);
    expect(isLive(meeting(), at('2026-10-20T22:59:59Z'))).toBe(true);
    expect(isLive(meeting(), at('2026-10-20T23:00:00Z'))).toBe(false);
    expect(isPast(meeting(), at('2026-10-20T22:59:59Z'))).toBe(false);
    expect(isPast(meeting(), at('2026-10-20T23:00:00Z'))).toBe(true);
  });
});

describe('splitMeetings', () => {
  const past1 = meeting({ id: 'past1', startsAt: '2026-10-19T22:00:00Z' });
  const past2 = meeting({ id: 'past2', startsAt: '2026-10-18T22:00:00Z' });
  const live = meeting({ id: 'live' }); // 3:00 – 4:00 PM, and it is 3:12
  const later = meeting({ id: 'later', startsAt: '2026-10-21T22:00:00Z' });
  const beta = meeting({ id: 'beta', title: 'Beta sync', startsAt: '2026-10-22T22:00:00Z' });
  const alpha = meeting({ id: 'alpha', title: 'Alpha sync', startsAt: '2026-10-22T22:00:00Z' });

  it('puts upcoming first, soonest on top, with a meeting in progress among them', () => {
    const { upcoming } = splitMeetings([beta, later, past1, live, alpha, past2], NOW);
    expect(upcoming.map((m) => m.id)).toEqual(['live', 'later', 'alpha', 'beta']);
  });

  it('puts past meetings most recent first', () => {
    const { past } = splitMeetings([past2, later, past1], NOW);
    expect(past.map((m) => m.id)).toEqual(['past1', 'past2']);
  });

  it('leaves the list it was given alone', () => {
    const input = [later, past1, live];
    splitMeetings(input, NOW);
    expect(input.map((m) => m.id)).toEqual(['later', 'past1', 'live']);
  });
});

describe('toScheduleItem', () => {
  const people = { u1: { id: 'u1', name: 'Pat Lee', avatarUrl: 'https://img.example/pat.png', you: true } };

  it('describes the meeting as a team-scoped schedule item run by its organizer', () => {
    const item = toScheduleItem(
      meeting({ createdBy: 'u1', location: 'E2 room 180', zoomUrl: 'https://ucsc.zoom.us/j/1', note: 'Bring the board' }),
      { teamName: 'Team 1', people, href: '/app/projects/p1' },
    );
    expect(item).toEqual({
      id: 'm1',
      kind: 'meeting',
      title: 'Sprint 3 planning',
      startsAt: '2026-10-20T22:00:00.000Z',
      endsAt: '2026-10-20T23:00:00.000Z',
      allDay: false,
      scope: 'team',
      teamName: 'Team 1',
      projectId: 'p1',
      location: 'E2 room 180',
      zoomUrl: 'https://ucsc.zoom.us/j/1',
      note: 'Bring the board',
      host: { id: 'u1', name: 'Pat Lee', avatarUrl: 'https://img.example/pat.png', you: true, role: 'Organizer' },
      href: '/app/projects/p1',
    });
  });

  it('leaves out what the meeting does not have, and normalizes the start to UTC', () => {
    const item = toScheduleItem(meeting({ startsAt: '2026-10-20T15:00:00-07:00', location: null, zoomUrl: null, note: null }));
    expect(item.startsAt).toBe('2026-10-20T22:00:00.000Z');
    expect(item.location).toBeUndefined();
    expect(item.zoomUrl).toBeUndefined();
    expect(item.note).toBeUndefined();
    expect(item.host).toBeUndefined();
    expect(item.teamName).toBeUndefined();
  });

  it('takes the organizer from the meeting itself when the API joined the person in', () => {
    const item = toScheduleItem(meeting({ createdBy: { id: 'u2', name: 'Sam Ortiz' } }), { people });
    expect(item.host).toMatchObject({ id: 'u2', name: 'Sam Ortiz', role: 'Organizer' });
  });

  it('has no organizer for a user the people map does not know', () => {
    expect(toScheduleItem(meeting({ createdBy: 'u9' }), { people }).host).toBeUndefined();
  });
});

describe('wall clock and instant', () => {
  it('reads a typed date and time on the viewer clock across the DST change', () => {
    // US clocks went back on Sun Nov 1, 2026: PDT (UTC-7) before it, PST (UTC-8) after.
    expect(zonedToInstant('2026-11-03', '15:00', LA).toISOString()).toBe('2026-11-03T23:00:00.000Z');
    expect(zonedToInstant('2026-10-27', '15:00', LA).toISOString()).toBe('2026-10-27T22:00:00.000Z');
  });

  it('reads a time in the hours right after a clock change, where a single offset guess is off by an hour', () => {
    // Fall back: US clocks went from 2:00 AM PDT (09:00 UTC) to 1:00 AM PST on Sun Nov 1, 2026.
    expect(zonedToInstant('2026-11-01', '00:30', LA).toISOString()).toBe('2026-11-01T07:30:00.000Z'); // still PDT
    expect(zonedToInstant('2026-11-01', '03:00', LA).toISOString()).toBe('2026-11-01T11:00:00.000Z'); // PST
    expect(zonedToInstant('2026-11-01', '05:00', LA).toISOString()).toBe('2026-11-01T13:00:00.000Z'); // PST
    // Spring forward: from 2:00 AM PST (10:00 UTC) to 3:00 AM PDT on Sun Mar 8, 2026.
    expect(zonedToInstant('2026-03-08', '01:30', LA).toISOString()).toBe('2026-03-08T09:30:00.000Z'); // PST
    expect(zonedToInstant('2026-03-08', '03:30', LA).toISOString()).toBe('2026-03-08T10:30:00.000Z'); // PDT
    expect(zonedToInstant('2026-03-08', '05:00', LA).toISOString()).toBe('2026-03-08T12:00:00.000Z'); // PDT
  });

  it('reads it on a zone that has no daylight saving', () => {
    expect(zonedToInstant('2026-10-21', '15:00', IST).toISOString()).toBe('2026-10-21T09:30:00.000Z');
  });

  it('turns an instant back into the date and time on that clock, with midnight as 00:00', () => {
    expect(instantToZoned('2026-11-03T23:00:00.000Z', LA)).toEqual({ date: '2026-11-03', time: '15:00' });
    expect(instantToZoned(new Date('2026-10-21T07:00:00Z'), LA)).toEqual({ date: '2026-10-21', time: '00:00' });
    expect(instantToZoned('2026-10-20T22:00:00Z', IST)).toEqual({ date: '2026-10-21', time: '03:30' });
  });

  it('round-trips a typed time in any zone', () => {
    for (const zone of [LA, IST, ISTANBUL, 'Pacific/Auckland']) {
      for (const [date, time] of [['2026-10-21', '15:00'], ['2026-11-03', '00:00'], ['2026-03-09', '23:45']]) {
        expect(instantToZoned(zonedToInstant(date, time, zone), zone)).toEqual({ date, time });
      }
    }
  });
});

describe('campusTimeOf', () => {
  it('shows the campus time beside the field when zones differ', () => {
    expect(campusTimeOf('2026-10-21', '15:00', IST, LA)).toBe('2:30 AM PT');
  });

  it('adds the campus weekday when the campus day is not the viewer’s', () => {
    expect(campusTimeOf('2026-10-21', '10:00', IST, LA)).toBe('9:30 PM PT · Tue');
  });

  it('has nothing to show until both the date and the time are set', () => {
    expect(campusTimeOf('', '15:00', IST, LA)).toBeNull();
    expect(campusTimeOf('2026-10-21', '', IST, LA)).toBeNull();
  });

  it('is the campus time of whatever school it is given, Pacific or not', () => {
    // 3:00 PM on Wed Oct 21 in Santa Cruz is 22:00 UTC: 1:00 AM on Thu Oct 22 in Istanbul (UTC+3).
    expect(campusTimeOf('2026-10-21', '15:00', LA, ISTANBUL)).toBe('1:00 AM GMT+3 · Thu');
    // 3:00 PM in Kolkata (UTC+5:30) is 09:30 UTC: 12:30 PM the same day in Istanbul.
    expect(campusTimeOf('2026-10-21', '15:00', IST, ISTANBUL)).toBe('12:30 PM GMT+3');
  });
});

describe('fmtMeetingWhen', () => {
  it('splits a meeting into its day, start, end and range once the period is shared', () => {
    expect(fmtMeetingWhen(meeting(), LA, NOW)).toEqual({ day: 'Tue, Oct 20', start: '3:00', end: '4:00 PM', range: '3:00 – 4:00 PM' });
  });

  it('keeps both periods when the meeting crosses noon', () => {
    const noon = meeting({ startsAt: '2026-10-20T18:30:00Z' });
    expect(fmtMeetingWhen(noon, LA, NOW)).toEqual({ day: 'Tue, Oct 20', start: '11:30 AM', end: '12:30 PM', range: '11:30 AM – 12:30 PM' });
  });

  it('reads the day and times on the viewer’s clock', () => {
    expect(fmtMeetingWhen(meeting(), IST, NOW)).toEqual({ day: 'Wed, Oct 21', start: '3:30', end: '4:30 AM', range: '3:30 – 4:30 AM' });
  });

  it('adds the year when the meeting is not in the current one', () => {
    expect(fmtMeetingWhen(meeting(), LA, new Date('2027-01-05T20:00:00Z')).day).toBe('Tue, Oct 20, 2026');
  });
});

describe('without a zone', () => {
  // The viewer is in Istanbul (UTC+3 all year): 01:00 on Wed Oct 21 there is 22:00 UTC on Tue Oct 20,
  // which is 3:00 PM in Santa Cruz. The model reads the viewer's clock, never the school's.
  beforeEach(() => viewerIn(ISTANBUL));

  it('reads and writes the wall clock on the viewer’s zone', () => {
    expect(zonedToInstant('2026-10-21', '01:00').toISOString()).toBe('2026-10-20T22:00:00.000Z');
    expect(instantToZoned('2026-10-20T22:00:00Z')).toEqual({ date: '2026-10-21', time: '01:00' });
  });

  it('shows a meeting, fills the form from it and validates what is typed, all on the viewer’s clock', () => {
    expect(fmtMeetingWhen(meeting(), undefined, NOW)).toEqual({ day: 'Wed, Oct 21', start: '1:00', end: '2:00 AM', range: '1:00 – 2:00 AM' });
    expect(draftFrom(meeting())).toMatchObject({ date: '2026-10-21', time: '01:00' });
    const earlier = { now: new Date('2026-10-20T10:00:00Z') };
    expect(validateTeamMeeting(draft({ date: '2026-10-21', time: '01:00' }), earlier).value?.startsAt).toBe('2026-10-20T22:00:00.000Z');
  });
});

describe('draftFrom', () => {
  it('starts a new meeting blank, an hour long', () => {
    expect(draftFrom(null, LA)).toEqual({ title: '', date: '', time: '', durationMinutes: 60, location: '', zoomUrl: '', note: '' });
  });

  it('fills the form from a meeting, on the viewer’s clock', () => {
    const existing = meeting({ durationMinutes: 90, location: 'E2 room 180', zoomUrl: 'https://ucsc.zoom.us/j/1', note: 'Bring the board' });
    expect(draftFrom(existing, LA)).toEqual({
      title: 'Sprint 3 planning',
      date: '2026-10-20',
      time: '15:00',
      durationMinutes: 90,
      location: 'E2 room 180',
      zoomUrl: 'https://ucsc.zoom.us/j/1',
      note: 'Bring the board',
    });
    expect(draftFrom(existing, IST)).toMatchObject({ date: '2026-10-21', time: '03:30' });
  });

  it('writes a blank for what the meeting does not have, and an hour for a missing length', () => {
    const bare = draftFrom(meeting({ location: null, zoomUrl: null, note: null, durationMinutes: 0 }), LA);
    expect(bare).toMatchObject({ location: '', zoomUrl: '', note: '', durationMinutes: 60 });
  });
});

describe('isHttpUrl', () => {
  it('accepts a full http or https address', () => {
    expect(isHttpUrl('https://ucsc.zoom.us/j/123')).toBe(true);
    expect(isHttpUrl('http://localhost:3000/room')).toBe(true);
  });

  it('refuses anything else, javascript: included', () => {
    expect(isHttpUrl('zoom.us/j/123')).toBe(false);
    expect(isHttpUrl('ftp://files.example.org')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('https://')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});

describe('validateTeamMeeting', () => {
  const opts = { now: NOW, zone: LA };

  it('uses the handoff copy for every validation error', () => {
    const errorOf = (over: Partial<TeamMeetingDraft>, field: 'title' | 'date' | 'time' | 'zoomUrl' | 'note') =>
      validateTeamMeeting(draft(over), opts).errors[field];
    expect({
      title: errorOf({ title: '   ' }, 'title'),
      titleLength: errorOf({ title: 'x'.repeat(81) }, 'title'),
      date: errorOf({ date: '' }, 'date'),
      time: errorOf({ time: '' }, 'time'),
      passed: errorOf({ date: '2026-10-19' }, 'time'),
      zoomUrl: errorOf({ zoomUrl: 'zoom.us/j/1' }, 'zoomUrl'),
      note: errorOf({ note: 'x'.repeat(501) }, 'note'),
    }).toEqual({
      title: 'Give the meeting a title.',
      titleLength: 'Keep it under 80 characters.',
      date: 'Pick a date.',
      time: 'Pick a start time.',
      passed: 'That time has already passed.',
      zoomUrl: 'Enter the full link, like https://ucsc.zoom.us/j/…',
      note: 'Keep the note under 500 characters.',
    });
  });

  it('reports every problem at once, with nothing to send', () => {
    const result = validateTeamMeeting(draft({ title: '', date: '', time: '', zoomUrl: 'nope', note: 'x'.repeat(501) }), opts);
    expect(result.valid).toBe(false);
    expect(result.value).toBeNull();
    expect(Object.keys(result.errors).sort()).toEqual(['date', 'note', 'time', 'title', 'zoomUrl']);
  });

  it('refuses a start that has passed when creating, and allows it when editing', () => {
    const earlier = draft({ date: '2026-10-20', time: '14:00' }); // 2:00 PM, an hour and twelve minutes ago
    expect(validateTeamMeeting(earlier, { ...opts, creating: true }).errors.time).toBe('That time has already passed.');
    expect(validateTeamMeeting(earlier, { ...opts, creating: false }).valid).toBe(true);
    expect(validateTeamMeeting(earlier, opts).valid).toBe(false); // creating is the default
  });

  it('allows a start at exactly this minute, and reports a missing time rather than a past one', () => {
    expect(validateTeamMeeting(draft({ date: '2026-10-20', time: '15:12' }), opts).valid).toBe(true);
    expect(validateTeamMeeting(draft({ date: '2026-10-19', time: '' }), opts).errors.time).toBe('Pick a start time.');
  });

  it('accepts the longest title and note', () => {
    const result = validateTeamMeeting(draft({ title: 'x'.repeat(80), note: ` ${'y'.repeat(500)} ` }), opts);
    expect(result.valid).toBe(true);
    expect(result.value?.note).toBe('y'.repeat(500));
  });

  it('turns a valid draft into the API payload: trimmed text, the typed time as an instant', () => {
    const result = validateTeamMeeting(
      draft({
        title: '  Design review  ',
        date: '2026-11-03',
        time: '15:00',
        durationMinutes: 90,
        location: ' E2 room 180 ',
        zoomUrl: ' https://ucsc.zoom.us/j/1 ',
        note: '  Bring the board ',
      }),
      opts,
    );
    expect(result).toEqual({
      valid: true,
      errors: {},
      value: {
        title: 'Design review',
        startsAt: '2026-11-03T23:00:00.000Z', // 3 PM PST, after the clocks went back
        durationMinutes: 90,
        location: 'E2 room 180',
        zoomUrl: 'https://ucsc.zoom.us/j/1',
        note: 'Bring the board',
      },
    });
  });

  it('reads the typed time on the viewer’s clock, whatever zone that is', () => {
    expect(validateTeamMeeting(draft({ date: '2026-11-03', time: '15:00' }), { ...opts, zone: IST }).value?.startsAt).toBe('2026-11-03T09:30:00.000Z');
  });

  it('sends null for a blank room, link or note, and an hour for a missing length', () => {
    const { value } = validateTeamMeeting(draft({ durationMinutes: 0, location: '  ', zoomUrl: '  ', note: '' }), opts);
    expect(value).toMatchObject({ durationMinutes: 60, location: null, zoomUrl: null, note: null });
  });
});

describe('showTeamMeetingsCard', () => {
  it('hides the card for members with no meetings and shows a quiet line to the Product Owner', () => {
    expect(showTeamMeetingsCard([], { canManage: false })).toBe(false);
    expect(showTeamMeetingsCard([])).toBe(false);
    expect(showTeamMeetingsCard([], { canManage: true })).toBe(true);
  });

  it('shows it to everyone once a meeting exists', () => {
    expect(showTeamMeetingsCard([meeting()], { canManage: false })).toBe(true);
    expect(showTeamMeetingsCard([meeting()], { canManage: true })).toBe(true);
  });

  it('keeps it while the meetings load and when they could not be loaded', () => {
    expect(showTeamMeetingsCard([], { canManage: false, status: 'loading' })).toBe(true);
    expect(showTeamMeetingsCard([], { canManage: false, status: 'error' })).toBe(true);
    expect(showTeamMeetingsCard([], { canManage: false, status: 'ready' })).toBe(false);
  });
});
