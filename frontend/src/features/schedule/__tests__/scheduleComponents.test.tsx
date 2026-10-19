import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AVATAR_COLORS } from '@/lib/avatarColors';
import { ScheduleDayHeader } from '../components/ScheduleDayHeader';
import { ScheduleIcon } from '../components/ScheduleIcon';
import { ScheduleItem } from '../components/ScheduleItem';
import type { ScheduleItemData } from '../scheduleModel';

const LA = 'America/Los_Angeles';
const IST = 'Asia/Kolkata';

/** Tue Oct 20, 2026, 2:30 PM PT: half an hour before the 3:00 PM meeting. */
const NOW = new Date('2026-10-20T21:30:00Z');

const meeting = (over: Partial<ScheduleItemData> = {}): ScheduleItemData => ({
  id: 'm1',
  kind: 'meeting',
  title: 'Sprint 3 planning',
  startsAt: '2026-10-20T22:00:00Z',
  endsAt: '2026-10-20T23:00:00Z',
  scope: 'team',
  teamName: 'Team 1',
  zoomUrl: 'https://ucsc.zoom.us/j/1',
  host: { id: 'u1', name: 'Pat Lee' },
  ...over,
});

/** A row is an <li>: seat it in the list the Team meetings card gives it. */
function renderRow(ui: ReactElement) {
  return render(
    <div className="gt-sched gt-sched--compact">
      <ol className="gt-sched__items">{ui}</ol>
    </div>,
  );
}

const row = () => screen.getByRole('listitem');

/**
 * Click a link without letting jsdom try to navigate. Reports whether the component had already
 * handled the click (called preventDefault) by the time it reached the document.
 */
function clickLink(link: Element): { handled: boolean } {
  let handled = false;
  const stop = (e: Event) => {
    handled = e.defaultPrevented;
    e.preventDefault();
  };
  document.addEventListener('click', stop);
  try {
    fireEvent.click(link);
  } finally {
    document.removeEventListener('click', stop);
  }
  return { handled };
}

/** jsdom reports a hex background as `rgb(r, g, b)`. */
function rgbToHex(rgb: string): string {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

describe('ScheduleItem (compact row)', () => {
  it('shows a team meeting as a time block, a kind tile, the title, its context and the organizer', () => {
    renderRow(<ScheduleItem item={meeting()} now={NOW} zone={LA} />);

    expect(row()).toHaveClass('gt-sched-item', 'gt-sched-item--meeting', 'gt-sched-item--upcoming');
    expect(row()).not.toHaveAttribute('aria-current');

    const start = screen.getByText('3:00 PM');
    expect(start.tagName).toBe('TIME');
    expect(start).toHaveAttribute('datetime', '2026-10-20T22:00:00Z');
    const duration = screen.getByText('1 h');
    expect(duration).toHaveAttribute('datetime', 'PT1H');

    expect(screen.getByText('Sprint 3 planning')).toBeInTheDocument();
    expect(screen.getByText('Meeting')).toHaveClass('gt-sched-item__kind');
    expect(screen.getByText('Team 1')).toHaveClass('gt-sched-item__meta-primary');
    expect(screen.getByText('Zoom')).toHaveClass('gt-sched-item__place');

    const organizer = screen.getByRole('img', { name: 'Pat Lee' });
    expect(organizer).toHaveTextContent('PL');
    expect(organizer).toHaveAttribute('title', 'Pat Lee · Organizer');
    expect(row().querySelector('.gt-sched-item__tile svg')).toHaveClass('lucide-users');
  });

  it('puts the room in the context line instead of Zoom', () => {
    renderRow(<ScheduleItem item={meeting({ location: 'E2 room 180' })} now={NOW} zone={LA} />);
    expect(screen.getByText('E2 room 180')).toHaveClass('gt-sched-item__place');
    expect(screen.queryByText('Zoom')).not.toBeInTheDocument();
  });

  it('drops the MEETING eyebrow when the title already says it', () => {
    renderRow(<ScheduleItem item={meeting({ title: 'Team meeting' })} now={NOW} zone={LA} />);
    expect(row().querySelector('.gt-sched-item__kind')).toBeNull();
  });

  it('calls a whole-class meeting by that name when no team is given', () => {
    renderRow(<ScheduleItem item={meeting({ teamName: undefined, scope: 'class', zoomUrl: null })} now={NOW} zone={LA} />);
    expect(screen.getByText('Whole class')).toHaveClass('gt-sched-item__meta-primary');
  });

  it('marks a meeting in progress Live and offers Join Zoom', () => {
    const onJoin = vi.fn();
    const item = meeting();
    renderRow(<ScheduleItem item={item} now={new Date('2026-10-20T22:10:00Z')} zone={LA} onJoin={onJoin} />);

    expect(row()).toHaveAttribute('aria-current', 'true');
    expect(row()).toHaveClass('gt-sched-item--live');
    expect(screen.getByText('Live')).toHaveClass('gt-sched-item__live');

    const join = screen.getByRole('link', { name: 'Join Zoom' });
    expect(join).toHaveClass('gt-sched-item__action--primary');
    expect(join).toHaveAttribute('href', 'https://ucsc.zoom.us/j/1');
    expect(join).toHaveAttribute('target', '_blank');
    expect(join).toHaveAttribute('rel', 'noreferrer');
    clickLink(join);
    expect(onJoin).toHaveBeenCalledWith(item);
  });

  it('offers Join Zoom from ten minutes before the start, and only then', () => {
    const { rerender } = renderRow(<ScheduleItem item={meeting()} now={new Date('2026-10-20T21:49:00Z')} zone={LA} />);
    expect(screen.queryByRole('link', { name: 'Join Zoom' })).not.toBeInTheDocument();
    rerender(
      <div className="gt-sched gt-sched--compact">
        <ol className="gt-sched__items">
          <ScheduleItem item={meeting()} now={new Date('2026-10-20T21:50:00Z')} zone={LA} />
        </ol>
      </div>,
    );
    expect(screen.getByRole('link', { name: 'Join Zoom' })).toBeInTheDocument();
    expect(row()).toHaveClass('gt-sched-item--upcoming');
  });

  it('has no Join action and no Zoom place without a Zoom link', () => {
    renderRow(<ScheduleItem item={meeting({ zoomUrl: null })} now={new Date('2026-10-20T22:10:00Z')} zone={LA} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Zoom')).not.toBeInTheDocument();
  });

  it('shows a meeting that has ended as past, with nothing to join', () => {
    renderRow(<ScheduleItem item={meeting()} now={new Date('2026-10-20T23:30:00Z')} zone={LA} />);
    expect(row()).toHaveClass('gt-sched-item--past');
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Join Zoom' })).not.toBeInTheDocument();
  });

  it('reads times on the viewer’s clock and keeps the campus time in the title when asked', () => {
    renderRow(<ScheduleItem item={meeting()} now={NOW} zone={IST} schoolZone={LA} showSchoolTime />);
    const start = screen.getByText('3:30 AM');
    expect(start).toHaveAttribute('title', '3:00 – 4:00 PM PT');
  });

  it('leaves the campus time out of the title unless asked', () => {
    renderRow(<ScheduleItem item={meeting()} now={NOW} zone={IST} schoolZone={LA} />);
    expect(screen.getByText('3:30 AM')).not.toHaveAttribute('title');
  });

  it('strikes a cancelled meeting, says why and offers no Join', () => {
    renderRow(
      <ScheduleItem
        item={meeting({ status: 'cancelled', cancelReason: 'Room double-booked' })}
        now={new Date('2026-10-20T22:10:00Z')}
        zone={LA}
      />,
    );
    expect(row()).toHaveClass('gt-sched-item--cancelled');
    expect(screen.getByText('Cancelled')).toHaveClass('gt-badge', 'gt-badge--neutral');
    expect(screen.getByText('Room double-booked')).toHaveClass('gt-sched-item__reason');
    expect(screen.queryByRole('link', { name: 'Join Zoom' })).not.toBeInTheDocument();
  });

  it('says Time TBD instead of a time, and lets staff set one', () => {
    const onSetTime = vi.fn();
    const item = meeting({ status: 'tbd' });
    const { rerender } = renderRow(<ScheduleItem item={item} now={NOW} zone={LA} lens="student" onSetTime={onSetTime} />);
    expect(screen.getByText('Time TBD')).toBeInTheDocument();
    expect(row().querySelector('time')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set time' })).not.toBeInTheDocument();

    rerender(
      <div className="gt-sched gt-sched--compact">
        <ol className="gt-sched__items">
          <ScheduleItem item={item} now={NOW} zone={LA} lens="ta" onSetTime={onSetTime} />
        </ol>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set time' }));
    expect(onSetTime).toHaveBeenCalledWith(item);
  });

  it('says All day for an all-day item', () => {
    renderRow(<ScheduleItem item={meeting({ allDay: true, endsAt: null })} now={NOW} zone={LA} />);
    expect(screen.getByText('All day')).toBeInTheDocument();
    expect(row().querySelector('time')).toBeNull();
  });

  it('shows a deadline as a one-line marker with a linked title', () => {
    const onOpen = vi.fn();
    const item: ScheduleItemData = {
      id: 'd1',
      kind: 'deadline',
      title: 'TSR 4 due',
      startsAt: '2026-10-21T06:59:00Z',
      endsAt: null,
      href: '/app/assignments/a1',
    };
    renderRow(<ScheduleItem item={item} now={NOW} zone={LA} onOpen={onOpen} />);

    expect(row()).toHaveClass('gt-sched-item--marker');
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText('Deadline')).toHaveClass('gt-sched-item__kind');
    const title = screen.getByRole('link', { name: 'TSR 4 due' });
    expect(title).toHaveAttribute('href', '/app/assignments/a1');
    expect(clickLink(title).handled).toBe(true); // handled in place, not followed
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it('follows a deadline link as usual when nothing handles the click', () => {
    const item: ScheduleItemData = { id: 'd1', kind: 'deadline', title: 'TSR 4 due', startsAt: '2026-10-21T06:59:00Z', href: '/app/assignments/a1' };
    renderRow(<ScheduleItem item={item} now={NOW} zone={LA} />);
    expect(clickLink(screen.getByRole('link', { name: 'TSR 4 due' })).handled).toBe(false);
  });

  it('counts down to a final review under a week away and shows both reviewers', () => {
    const review: ScheduleItemData = {
      id: 'f1',
      kind: 'final_review',
      title: 'Final review',
      startsAt: '2026-10-23T21:40:00Z',
      endsAt: '2026-10-23T22:40:00Z',
      teamName: 'Team 1',
      zoomUrl: 'https://ucsc.zoom.us/j/9',
      host: { name: 'Not shown' },
      reviewers: [
        { name: 'Ada Home', slot: 'home' },
        { name: 'Rex Review', slot: 'review', you: true },
      ],
    };
    renderRow(<ScheduleItem item={review} now={NOW} zone={LA} />);

    expect(screen.getByText('in 3 days')).toHaveClass('gt-sched-item__countdown');
    expect(screen.getByText('Shared Zoom room')).toHaveClass('gt-sched-item__place');
    expect(row().querySelector('.gt-sched-item__kind')).toBeNull(); // the title says it
    expect(screen.getByRole('img', { name: 'Ada Home' })).toHaveAttribute('title', 'Ada Home · Home TA');
    expect(screen.getByRole('img', { name: 'Rex Review' })).toHaveAttribute('title', 'You · Review TA');
    expect(screen.queryByRole('img', { name: 'Not shown' })).not.toBeInTheDocument();
  });

  it('shows no countdown for a meeting, or once the review has begun', () => {
    const { rerender } = renderRow(<ScheduleItem item={meeting({ startsAt: '2026-10-21T21:40:00Z', endsAt: null })} now={NOW} zone={LA} />);
    expect(screen.queryByText('tomorrow')).not.toBeInTheDocument();

    const review: ScheduleItemData = { id: 'f1', kind: 'final_review', title: 'Final review', startsAt: '2026-10-20T22:00:00Z', endsAt: '2026-10-20T23:00:00Z' };
    rerender(
      <div className="gt-sched gt-sched--compact">
        <ol className="gt-sched__items">
          <ScheduleItem item={review} now={new Date('2026-10-20T22:10:00Z')} zone={LA} />
        </ol>
      </div>,
    );
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('today')).not.toBeInTheDocument();
  });

  it('shows a student their own attendance at a past TA meeting', () => {
    const ta: ScheduleItemData = {
      id: 't1',
      kind: 'ta_meeting',
      title: 'TA meeting',
      startsAt: '2026-10-13T22:00:00Z',
      endsAt: '2026-10-13T22:45:00Z',
      teamName: 'Team 1',
      recurrenceLabel: 'Weekly · Tue',
      meetingIndex: 2,
      meetingsPerWeek: 2,
      attendance: 'late',
      host: { name: 'Ro Trinh' },
    };
    renderRow(<ScheduleItem item={ta} now={NOW} zone={LA} />);

    expect(screen.getByText('Late')).toHaveClass('gt-badge', 'gt-badge--warning');
    expect(screen.getByText('Weekly · Tue')).toBeInTheDocument();
    expect(screen.getByText('Meeting 2 of 2 this week')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ro Trinh' })).toHaveAttribute('title', 'Ro Trinh · TA');
  });

  it('gives staff the tally and Mark attendance for a past TA meeting', () => {
    const onMarkAttendance = vi.fn();
    const ta: ScheduleItemData = {
      id: 't1',
      kind: 'ta_meeting',
      title: 'TA meeting',
      startsAt: '2026-10-13T22:00:00Z',
      endsAt: '2026-10-13T22:45:00Z',
      teamName: 'Team 1',
      attendance: { present: 3, total: 4 },
    };
    const { rerender } = renderRow(<ScheduleItem item={ta} now={NOW} zone={LA} lens="ta" onMarkAttendance={onMarkAttendance} />);
    expect(screen.getByText('3/4 present')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark attendance' }));
    expect(onMarkAttendance).toHaveBeenCalledWith(ta);

    rerender(
      <div className="gt-sched gt-sched--compact">
        <ol className="gt-sched__items">
          <ScheduleItem item={ta} now={NOW} zone={LA} lens="student" onMarkAttendance={onMarkAttendance} />
        </ol>
      </div>,
    );
    expect(screen.queryByText('3/4 present')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark attendance' })).not.toBeInTheDocument();
  });

  it('names the items a row overlaps with, in the pill’s title and for screen readers', () => {
    const other = meeting({ id: 'o1', title: 'Office hours' });
    renderRow(<ScheduleItem item={meeting()} now={NOW} zone={LA} overlaps={[other]} />);
    expect(row()).toHaveClass('gt-sched-item--overlap');
    const pill = screen.getByText('Overlaps', { exact: false }).closest('.gt-badge');
    expect(pill).toHaveClass('gt-badge--warning');
    expect(pill).toHaveAttribute('title', 'Overlaps with Office hours');
    expect(pill).toHaveTextContent('Overlaps with Office hours');
  });

  it('shows a photo when the person has one, initials on a name-based colour otherwise', () => {
    const { rerender } = renderRow(<ScheduleItem item={meeting({ host: { name: 'Pat Lee', avatarUrl: 'https://img.example/pat.png' } })} now={NOW} zone={LA} />);
    const photo = screen.getByRole('img', { name: 'Pat Lee' });
    expect(photo.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('src', 'https://img.example/pat.png');

    rerender(
      <div className="gt-sched gt-sched--compact">
        <ol className="gt-sched__items">
          <ScheduleItem item={meeting({ host: { name: 'Pat Lee' } })} now={NOW} zone={LA} />
        </ol>
      </div>,
    );
    const initials = screen.getByRole('img', { name: 'Pat Lee' });
    expect(initials.tagName).toBe('SPAN');
    expect(initials).toHaveClass('gt-avatar', 'gt-avatar--xs');
    expect(AVATAR_COLORS.map((c) => c.toLowerCase())).toContain(rgbToHex(initials.style.backgroundColor));
  });

  it('draws "?" for a person whose name is blank', () => {
    renderRow(<ScheduleItem item={meeting({ host: { name: '   ' } })} now={NOW} zone={LA} />);
    expect(row().querySelector('.gt-avatar')).toHaveTextContent('?');
  });

  it('adds a class of its own', () => {
    renderRow(<ScheduleItem item={meeting()} now={NOW} zone={LA} className="extra" />);
    expect(row()).toHaveClass('extra');
  });
});

describe('ScheduleDayHeader', () => {
  it('labels today in green with the weekday and date', () => {
    const { container } = render(<ScheduleDayHeader dayKey="2026-10-20" now={NOW} zone={LA} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Tue, Oct 20')).toHaveClass('gt-sched-day__date');
    expect(container.firstChild).toHaveClass('gt-sched-day', 'gt-sched-day--today');
  });

  it('labels another day by its weekday, without the today treatment', () => {
    const { container } = render(<ScheduleDayHeader dayKey="2026-10-22" now={NOW} zone={LA} />);
    expect(screen.getByRole('heading', { name: 'Thursday' })).toBeInTheDocument();
    expect(screen.getByText('Oct 22')).toBeInTheDocument();
    expect(container.firstChild).not.toHaveClass('gt-sched-day--today');
  });

  it('can be forced to the today treatment', () => {
    const { container } = render(<ScheduleDayHeader dayKey="2026-10-22" now={NOW} zone={LA} isToday />);
    expect(container.firstChild).toHaveClass('gt-sched-day--today');
  });

  it('takes a custom heading, a side note, an id for the list to point at and another heading level', () => {
    render(<ScheduleDayHeader title="Next" date="Monday, Oct 26" aside="2 left" id="day-next" as="h2" />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Next' });
    expect(heading).toHaveAttribute('id', 'day-next');
    expect(heading).toHaveClass('gt-sched-day__title');
    expect(screen.getByText('Monday, Oct 26')).toBeInTheDocument();
    expect(screen.getByText('2 left')).toHaveClass('gt-sched-day__aside');
  });

  it('leaves the date out when there is none', () => {
    const { container } = render(<ScheduleDayHeader title="Soon" />);
    expect(container.querySelector('.gt-sched-day__date')).toBeNull();
  });
});

describe('ScheduleIcon', () => {
  const NAMES = [
    'video', 'clipboard-check', 'users', 'book-open', 'door-open', 'flag', 'clock', 'calendar-days', 'calendar-plus',
    'chevron-left', 'chevron-right', 'chevron-down', 'map-pin', 'refresh-cw', 'circle-alert', 'globe', 'arrow-right',
  ];

  it.each(NAMES)('draws %s', (name) => {
    const { container } = render(<ScheduleIcon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass(`lucide-${name}`);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('is 16 px unless told otherwise, and takes a class', () => {
    const { container, rerender } = render(<ScheduleIcon name="video" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
    rerender(<ScheduleIcon name="video" size={12} className="extra" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '12');
    expect(container.querySelector('svg')).toHaveClass('extra');
  });

  it('draws a calendar for a name it does not know', () => {
    const { container } = render(<ScheduleIcon name="hologram" />);
    expect(container.querySelector('svg')).toHaveClass('lucide-calendar-days');
  });
});
