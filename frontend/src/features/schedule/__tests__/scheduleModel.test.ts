import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COUNTDOWN_DAYS,
  JOIN_WINDOW_MS,
  SCHOOL_ZONE,
  countdown,
  dayKey,
  fmtDayLabel,
  fmtDuration,
  fmtTime,
  fmtTimeRange,
  groupByDay,
  isJoinable,
  isoDuration,
  keyToDate,
  kindMeta,
  shiftKey,
  sortItems,
  statusOf,
  viewerZone,
  zoneDiffers,
  zoneLabel,
  type ScheduleItemData,
} from '../scheduleModel';

const LA = 'America/Los_Angeles';
const IST = 'Asia/Kolkata';

/** Tue Oct 20, 2026, 3:12 PM PT: the clock the design's demo is pinned to. */
const NOW = new Date('2026-10-20T22:12:00Z');

const item = (over: Partial<ScheduleItemData> = {}): ScheduleItemData => ({
  id: 'i1',
  kind: 'meeting',
  title: 'Sprint 3 planning',
  startsAt: '2026-10-20T22:00:00Z',
  endsAt: '2026-10-20T22:45:00Z',
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('constants', () => {
  it('uses the Pacific school zone, a ten-minute Join window and a one-week countdown', () => {
    expect(SCHOOL_ZONE).toBe('America/Los_Angeles');
    expect(JOIN_WINDOW_MS).toBe(10 * 60 * 1000);
    expect(COUNTDOWN_DAYS).toBe(7);
  });
});

describe('kindMeta', () => {
  it('pairs every kind with its glyph and tone, and looks an unknown kind up as a gray calendar', () => {
    expect(kindMeta('meeting')).toMatchObject({ label: 'Meeting', icon: 'users', tone: 'blue' });
    expect(kindMeta('ta_meeting')).toMatchObject({ label: 'TA meeting', icon: 'video', tone: 'green' });
    expect(kindMeta('final_review')).toMatchObject({ label: 'Final review', icon: 'clipboard-check', tone: 'purple' });
    expect(kindMeta('lecture')).toMatchObject({ icon: 'book-open', tone: 'gray' });
    expect(kindMeta('office_hours')).toMatchObject({ icon: 'door-open', tone: 'outline' });
    expect(kindMeta('deadline')).toMatchObject({ icon: 'flag', tone: 'amber' });
    expect(kindMeta('sprint')).toMatchObject({ icon: null, tone: null });
    expect(kindMeta('webinar')).toMatchObject({ kind: 'webinar', label: 'webinar', icon: 'calendar-days', tone: 'gray' });
  });
});

describe('day keys', () => {
  it('reads the calendar day on the zone’s own clock', () => {
    expect(dayKey('2026-10-21T06:30:00Z', LA)).toBe('2026-10-20'); // 11:30 PM Tuesday in Santa Cruz
    expect(dayKey('2026-10-21T06:30:00Z', IST)).toBe('2026-10-21'); // noon Wednesday in Kolkata
    expect(dayKey(new Date('2026-11-01T08:30:00Z'))).toBe('2026-11-01'); // the school zone by default
  });

  it('moves a key by whole days without being fooled by a daylight-saving change', () => {
    expect(keyToDate('2026-10-20').toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(shiftKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftKey('2026-11-01', 7)).toBe('2026-11-08');
    expect(shiftKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('statusOf', () => {
  it('is upcoming before the start, live from the start and past from the end', () => {
    expect(statusOf(item(), new Date('2026-10-20T21:59:59Z'), LA)).toBe('upcoming');
    expect(statusOf(item(), new Date('2026-10-20T22:00:00Z'), LA)).toBe('live');
    expect(statusOf(item(), new Date('2026-10-20T22:44:59Z'), LA)).toBe('live');
    expect(statusOf(item(), new Date('2026-10-20T22:45:00Z'), LA)).toBe('past');
  });

  it('keeps the status the data sends for cancelled and Time TBD, and never ends a sprint edge', () => {
    expect(statusOf(item({ status: 'cancelled' }), NOW, LA)).toBe('cancelled');
    expect(statusOf(item({ status: 'tbd' }), NOW, LA)).toBe('tbd');
    expect(statusOf(item({ kind: 'sprint', startsAt: '2026-10-01T07:00:00Z', endsAt: null }), NOW, LA)).toBe('upcoming');
  });

  it('treats an item with no end as a point in time', () => {
    const deadline = item({ kind: 'deadline', endsAt: null, startsAt: '2026-10-21T06:59:00Z' });
    expect(statusOf(deadline, NOW, LA)).toBe('upcoming');
    expect(statusOf(deadline, new Date('2026-10-21T06:59:00Z'), LA)).toBe('past');
  });

  it('keeps an all-day item upcoming through its day and past after it, by the zone’s calendar', () => {
    const allDay = item({ allDay: true, startsAt: '2026-10-20T07:00:00Z', endsAt: null }); // midnight Oct 20 PT
    expect(statusOf(allDay, new Date('2026-10-21T06:59:00Z'), LA)).toBe('upcoming'); // 11:59 PM Oct 20 PT
    expect(statusOf(allDay, new Date('2026-10-21T07:00:00Z'), LA)).toBe('past');
  });
});

describe('isJoinable', () => {
  const zoom = 'https://ucsc.zoom.us/j/123';

  it('opens Join ten minutes before the start until the end', () => {
    const meeting = item({ zoomUrl: zoom });
    expect(isJoinable(meeting, new Date('2026-10-20T21:49:00Z'))).toBe(false);
    expect(isJoinable(meeting, new Date('2026-10-20T21:50:00Z'))).toBe(true);
    expect(isJoinable(meeting, new Date('2026-10-20T22:45:00Z'))).toBe(false);
    expect(isJoinable(meeting, new Date('2026-10-20T22:45:01Z'))).toBe(false);
  });

  it('needs a Zoom link and a scheduled, timed item', () => {
    const inWindow = new Date('2026-10-20T22:10:00Z');
    expect(isJoinable(item(), inWindow)).toBe(false);
    expect(isJoinable(item({ zoomUrl: null }), inWindow)).toBe(false);
    expect(isJoinable(item({ zoomUrl: zoom, allDay: true }), inWindow)).toBe(false);
    expect(isJoinable(item({ zoomUrl: zoom, status: 'cancelled' }), inWindow)).toBe(false);
    expect(isJoinable(item({ zoomUrl: zoom, status: 'tbd' }), inWindow)).toBe(false);
  });

  it('closes at the start for an item with no end', () => {
    const point = item({ zoomUrl: zoom, endsAt: null });
    expect(isJoinable(point, new Date('2026-10-20T21:55:00Z'))).toBe(true);
    expect(isJoinable(point, new Date('2026-10-20T22:00:00Z'))).toBe(false);
  });
});

describe('countdown', () => {
  const review = (startsAt: string) => item({ kind: 'final_review', startsAt });

  it('says today, tomorrow or the days left once the item is under a week away', () => {
    expect(countdown(review('2026-10-21T01:00:00Z'), NOW, LA)).toBe('today'); // 6 PM Oct 20 PT
    expect(countdown(review('2026-10-21T21:40:00Z'), NOW, LA)).toBe('tomorrow');
    expect(countdown(review('2026-10-23T21:40:00Z'), NOW, LA)).toBe('in 3 days');
    expect(countdown(review('2026-10-26T21:40:00Z'), NOW, LA)).toBe('in 6 days');
  });

  it('says nothing from a week out, or once the day has passed', () => {
    expect(countdown(review('2026-10-27T21:40:00Z'), NOW, LA)).toBeNull();
    expect(countdown(review('2026-10-19T21:40:00Z'), NOW, LA)).toBeNull();
  });
});

describe('sortItems', () => {
  it('orders a day as sprint edge, all-day, timed by start, then Time TBD', () => {
    const tbd = item({ id: 'tbd', title: 'Alpha', status: 'tbd' });
    const late = item({ id: 'late', title: 'Zeta', startsAt: '2026-10-21T00:00:00Z' });
    const early = item({ id: 'early', title: 'Beta', startsAt: '2026-10-20T17:00:00Z' });
    const allDay = item({ id: 'allday', allDay: true, startsAt: '2026-10-20T07:00:00Z', endsAt: null });
    const sprint = item({ id: 'sprint', kind: 'sprint', title: 'Sprint 3 starts', startsAt: '2026-10-20T07:00:00Z', endsAt: null });
    const order = sortItems([tbd, late, early, allDay, sprint], LA).map((i) => i.id);
    expect(order).toEqual(['sprint', 'allday', 'early', 'late', 'tbd']);
  });

  it('breaks a tie on the start by title, and leaves the input alone', () => {
    const b = item({ id: 'b', title: 'Bravo' });
    const a = item({ id: 'a', title: 'Alpha' });
    const input = [b, a];
    expect(sortItems(input, LA).map((i) => i.id)).toEqual(['a', 'b']);
    expect(input.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('sorts by the day on the viewer’s clock', () => {
    const timed = item({ id: 'timed', startsAt: '2026-10-21T06:30:00Z', endsAt: '2026-10-21T07:30:00Z' }); // 11:30 PM Tue in Santa Cruz, noon Wed in Kolkata
    const allDay = item({ id: 'allday', allDay: true, startsAt: '2026-10-21T07:00:00Z', endsAt: null }); // midnight Wed in Santa Cruz
    expect(sortItems([allDay, timed], LA).map((i) => i.id)).toEqual(['timed', 'allday']); // different days
    expect(sortItems([allDay, timed], IST).map((i) => i.id)).toEqual(['allday', 'timed']); // one day: all-day first
  });
});

describe('groupByDay', () => {
  it('groups by day in order, marks today and keeps sprint edges apart from the rows', () => {
    const today = item({ id: 'today' });
    const edge = item({ id: 'edge', kind: 'sprint', title: 'Sprint 3 starts', startsAt: '2026-10-20T07:00:00Z', endsAt: null });
    const thursday = item({ id: 'thu', startsAt: '2026-10-22T21:00:00Z', endsAt: '2026-10-22T22:00:00Z' });
    const groups = groupByDay([thursday, today, edge], { zone: LA, now: NOW });
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: '2026-10-20', isToday: true });
    expect(groups[0].dividers.map((i) => i.id)).toEqual(['edge']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['today']);
    expect(groups[1]).toMatchObject({ key: '2026-10-22', isToday: false, dividers: [] });
    expect(groups[1].items.map((i) => i.id)).toEqual(['thu']);
  });

  it('groups nothing into nothing', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('formatters', () => {
  it('reads a time on the zone’s clock', () => {
    expect(fmtTime('2026-10-20T22:00:00Z', LA)).toBe('3:00 PM');
    expect(fmtTime(new Date('2026-10-20T22:00:00Z'), IST)).toBe('3:30 AM');
  });

  it('keeps a plain space before AM/PM even when the engine emits a narrow no-break space', () => {
    // Firefox and Safari put U+202F there; the period-once rule splits on a plain space.
    const RealDateTimeFormat = Intl.DateTimeFormat;
    function NarrowSpaceFormat(locale?: string, options?: Intl.DateTimeFormatOptions) {
      const real = new RealDateTimeFormat(locale, options);
      return { format: (date?: Date | number) => real.format(date).replace(' ', '\u202f') };
    }
    vi.stubGlobal('Intl', { DateTimeFormat: NarrowSpaceFormat });
    // A zone nothing else in this file formats in, so the model's formatter cache is cold (and stays
    // out of any later test's way: the stubbed formatter is cached under this zone).
    const zone = 'Pacific/Kiritimati';
    expect(fmtTime('2026-10-20T22:00:00Z', zone)).toBe('12:00 PM');
    expect(fmtTimeRange({ startsAt: '2026-10-20T22:00:00Z', endsAt: '2026-10-20T22:45:00Z' }, zone)).toBe('12:00 – 12:45 PM');
  });

  it('formats a range once when the period is shared', () => {
    expect(fmtTimeRange({ startsAt: '2026-10-20T22:00:00Z', endsAt: '2026-10-20T22:45:00Z' }, LA)).toBe('3:00 – 3:45 PM');
  });

  it('repeats the period when the range crosses noon, and shows only the start without an end', () => {
    expect(fmtTimeRange({ startsAt: '2026-10-20T18:30:00Z', endsAt: '2026-10-20T19:15:00Z' }, LA)).toBe('11:30 AM – 12:15 PM');
    expect(fmtTimeRange({ startsAt: '2026-10-20T22:00:00Z' }, LA)).toBe('3:00 PM');
    expect(fmtTimeRange({ startsAt: '2026-10-20T22:00:00Z', endsAt: null }, LA)).toBe('3:00 PM');
  });

  it('writes a duration for the row and for the <time> element', () => {
    const span = (mins: number) => ({ startsAt: '2026-10-20T22:00:00Z', endsAt: new Date(Date.parse('2026-10-20T22:00:00Z') + mins * 60000).toISOString() });
    expect(fmtDuration(span(45))).toBe('45 min');
    expect(fmtDuration(span(60))).toBe('1 h');
    expect(fmtDuration(span(65))).toBe('1 h 5 min');
    expect(fmtDuration(span(120))).toBe('2 h');
    expect(isoDuration(span(45))).toBe('PT45M');
    expect(isoDuration(span(60))).toBe('PT1H');
    expect(isoDuration(span(65))).toBe('PT1H5M');
    expect(isoDuration(span(120))).toBe('PT2H');
  });

  it('has no duration without an end, for an all-day item, or for an end that is not after the start', () => {
    expect(fmtDuration({ startsAt: '2026-10-20T22:00:00Z' })).toBeNull();
    expect(fmtDuration({ startsAt: '2026-10-20T22:00:00Z', endsAt: '2026-10-21T22:00:00Z', allDay: true })).toBeNull();
    expect(fmtDuration({ startsAt: '2026-10-20T22:00:00Z', endsAt: '2026-10-20T22:00:00Z' })).toBeNull();
    expect(isoDuration({ startsAt: '2026-10-20T22:00:00Z' })).toBeNull();
  });

  it('labels a day Today, Tomorrow or Yesterday with the weekday and date, else by weekday', () => {
    expect(fmtDayLabel('2026-10-20', NOW, LA)).toEqual({ title: 'Today', date: 'Tue, Oct 20', isToday: true });
    expect(fmtDayLabel('2026-10-21', NOW, LA)).toEqual({ title: 'Tomorrow', date: 'Wed, Oct 21', isToday: false });
    expect(fmtDayLabel('2026-10-19', NOW, LA)).toEqual({ title: 'Yesterday', date: 'Mon, Oct 19', isToday: false });
    expect(fmtDayLabel('2026-10-22', NOW, LA)).toEqual({ title: 'Thursday', date: 'Oct 22', isToday: false });
  });
});

describe('time zones', () => {
  it('shortens a zone to its label', () => {
    expect(zoneLabel(LA, new Date('2026-10-20T22:00:00Z'))).toBe('PT'); // PDT
    expect(zoneLabel(LA, new Date('2026-11-20T22:00:00Z'))).toBe('PT'); // PST
    expect(zoneLabel('America/New_York', new Date('2026-10-20T22:00:00Z'))).toBe('ET');
    expect(zoneLabel(IST, new Date('2026-10-20T22:00:00Z'))).toBe('GMT+5:30');
  });

  it('compares zones by UTC offset at the moment, so PDT against PST never counts as a difference', () => {
    const summer = new Date('2026-07-20T22:00:00Z');
    const winter = new Date('2026-12-20T22:00:00Z');
    expect(zoneDiffers(LA, LA, summer)).toBe(false);
    expect(zoneDiffers(LA, IST, summer)).toBe(true);
    // Fixed-offset zones only: a real zone's daylight-time rules can change, and then the
    // answer depends on the runner's time-zone data (America/Vancouver failed on CI this way).
    // UTC-7 all year: the same clock as Santa Cruz in summer, an hour ahead of it in winter.
    expect(zoneDiffers(LA, 'Etc/GMT+7', summer)).toBe(false);
    expect(zoneDiffers(LA, 'Etc/GMT+7', winter)).toBe(true);
    // UTC-8 all year: the same clock as Santa Cruz in winter, an hour behind it in summer.
    expect(zoneDiffers(LA, 'Etc/GMT+8', winter)).toBe(false);
    expect(zoneDiffers(LA, 'Etc/GMT+8', summer)).toBe(true);
  });

  it('reads the viewer’s zone from the browser, and falls back to the school zone', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: IST } as Intl.ResolvedDateTimeFormatOptions);
    expect(viewerZone()).toBe(IST);
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: '' } as Intl.ResolvedDateTimeFormatOptions);
    expect(viewerZone()).toBe(SCHOOL_ZONE);
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(viewerZone()).toBe(SCHOOL_ZONE);
  });
});
