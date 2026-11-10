import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleList, type ScheduleListProps } from '../components/ScheduleList';
import type { ScheduleItemData } from '../scheduleModel';

/** The school and, unless a test says otherwise, the viewer: UTC-8 all year. */
const ZONE = 'Etc/GMT+8';
/** Tue Nov 10, 2026, 3:12 PM at UTC-8. */
const NOW = new Date('2026-11-10T23:12:00Z');

const ta = (over: Partial<ScheduleItemData> = {}): ScheduleItemData => ({
  id: 'ta1',
  kind: 'ta_meeting',
  title: 'TA meeting',
  startsAt: '2026-11-10T23:00:00Z', // 3:00 PM, live at NOW
  endsAt: '2026-11-10T23:30:00Z',
  teamName: 'Alpha',
  zoomUrl: 'https://zoom.example/1',
  host: { id: 'ta', name: 'Tara Lee', role: 'TA' },
  recurrenceLabel: 'Weekly · Tue',
  ...over,
});

const at = (id: string, startsAt: string, over: Partial<ScheduleItemData> = {}): ScheduleItemData => ({
  id,
  kind: 'meeting',
  title: id,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
  ...over,
});

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderList(props: Partial<ScheduleListProps> = {}) {
  return render(
    <MemoryRouter initialEntries={['/app/home']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <ScheduleList items={[]} now={NOW} zone={ZONE} schoolZone={ZONE} {...props} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ScheduleList (compact)', () => {
  it('shows three skeleton rows while loading', () => {
    const { container } = renderList({ status: 'loading' });
    expect(screen.getByRole('status', { name: 'Loading schedule' })).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('.gt-sched__skeleton')).toHaveLength(3);
  });

  it('lists today with the Now line before the live row, which offers Join Zoom', () => {
    const morning = at('Standup', '2026-11-10T17:00:00Z');
    const evening = at('Retro', '2026-11-11T03:00:00Z');
    renderList({ items: [evening, ta(), morning] });
    const list = screen.getByRole('list', { name: 'Today' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('aria-label') ?? r.querySelector('.gt-sched-item__title')?.textContent)).toEqual([
      'Standup',
      'Now, 3:12 PM',
      'TA meeting',
      'Retro',
    ]);
    expect(rows[2]).toHaveAttribute('aria-current', 'true');
    expect(within(rows[2]).getByText('Live')).toBeInTheDocument();
    expect(within(rows[2]).getByRole('link', { name: 'Join Zoom' })).toHaveAttribute('href', 'https://zoom.example/1');
  });

  it('shows five rows, then says how many more today', () => {
    const items = Array.from({ length: 7 }, (_, i) => at(`M${i}`, `2026-11-11T0${i}:00:00Z`));
    renderList({ items });
    expect(screen.getAllByRole('listitem').filter((li) => li.classList.contains('gt-sched-item'))).toHaveLength(5);
    expect(screen.getByText('+2 more today')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /more today/ })).not.toBeInTheDocument();
  });

  it('draws today’s sprint edge as a rule above the list, not as a row', () => {
    const sprint: ScheduleItemData = {
      id: 's',
      kind: 'sprint',
      title: 'Sprint 4',
      startsAt: '2026-11-10T08:00:00Z',
      endsAt: null,
      allDay: true,
      sprint: { name: 'Sprint 4', edge: 'end' },
    };
    renderList({ items: [sprint, ta()] });
    expect(screen.getByText('Sprint 4 ends today')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Today' })).queryByText(/Sprint 4/)).not.toBeInTheDocument();
  });

  it('peeks at the next day with something, up to three rows, when today is empty', () => {
    const thursday = ['A', 'B', 'C', 'D'].map((id, i) => at(id, `2026-11-12T1${i}:00:00Z`));
    renderList({ items: thursday });
    expect(screen.getByText('Nothing scheduled today')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Next: Thursday, Nov 12' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('+1 more that day')).toBeInTheDocument();
  });

  it('says the card’s promise, verbatim, when nothing is scheduled in the range', () => {
    renderList({ items: [] });
    expect(screen.getByText('Nothing scheduled today')).toBeInTheDocument();
    expect(screen.getByText('Class events and deadlines will appear here.')).toBeInTheDocument();
  });

  it('fails quietly and lets the viewer try again', () => {
    const onRetry = vi.fn();
    renderList({ status: 'error', onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load your schedule');
    fireEvent.click(screen.getByRole('button', { name: 'try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says once when the viewer is in another zone, and puts the campus time in each time’s title', () => {
    // UTC+5: NOW is 4:12 AM on Wed Nov 11; the 3:00 PM (UTC-8) meeting was at 4:00 AM, the next at 8 AM.
    const next = at('Review', '2026-11-11T03:00:00Z');
    renderList({ items: [next], zone: 'Etc/GMT-5' });
    expect(screen.getByText('Times in GMT+5 · campus is GMT-8')).toBeInTheDocument();
    const time = screen.getByText('8:00 AM');
    expect(time).toHaveAttribute('title', '7:00 – 7:30 PM GMT-8');
  });

  it('has no footer when the viewer is on campus time', () => {
    const { container } = renderList({ items: [ta()] });
    expect(container.querySelector('.gt-sched__footer')).toBeNull();
  });

  it('offers staff a Mark attendance link to TA Meetings on a live TA meeting, and students none', () => {
    const { unmount } = renderList({ items: [ta()], lens: 'ta' });
    expect(screen.getByRole('link', { name: 'Mark attendance' })).toHaveAttribute('href', '/app/ta-meetings');
    unmount();
    renderList({ items: [ta()], lens: 'student' });
    expect(screen.queryByRole('link', { name: 'Mark attendance' })).not.toBeInTheDocument();
  });

  it('shows a student their own attendance on a past TA meeting', () => {
    renderList({ items: [ta({ startsAt: '2026-11-10T17:00:00Z', endsAt: '2026-11-10T17:30:00Z', attendance: 'late' })] });
    expect(screen.getByText('Late')).toBeInTheDocument();
  });

  it('opens a deadline in the app', () => {
    const deadline = at('TSR 4 due', '2026-11-11T07:59:00Z', { kind: 'deadline', endsAt: null, href: '/app/assignments/a1' });
    renderList({ items: [deadline] });
    fireEvent.click(screen.getByRole('link', { name: 'TSR 4 due' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app/assignments/a1');
  });

  describe('an all-day item lists on the school’s calendar day, wherever the viewer is', () => {
    // The school is at UTC-5 and the viewer at UTC-8. Sprint 4 starts on Tue Nov 10 at the school,
    // whose midnight is 9 PM on Monday for the viewer.
    const SCHOOL = 'Etc/GMT+5';
    const VIEWER = 'Etc/GMT+8';
    const sprint: ScheduleItemData = {
      id: 's4',
      kind: 'sprint',
      title: 'Sprint 4',
      startsAt: '2026-11-10T05:00:00Z',
      endsAt: null,
      allDay: true,
      date: '2026-11-10',
      sprint: { name: 'Sprint 4', edge: 'start' },
    };

    it('is not today on the viewer’s Monday evening, after school midnight', () => {
      renderList({
        items: [sprint, at('Late call', '2026-11-10T06:30:00Z')],
        now: new Date('2026-11-10T06:00:00Z'), // Mon 10 PM for the viewer
        zone: VIEWER,
        schoolZone: SCHOOL,
      });
      expect(screen.getByText('Late call')).toBeInTheDocument();
      expect(screen.queryByText(/Sprint 4 starts/)).not.toBeInTheDocument();
    });

    it('is today on the viewer’s Tuesday', () => {
      renderList({
        items: [sprint, at('Standup', '2026-11-10T18:00:00Z')],
        now: new Date('2026-11-10T16:00:00Z'), // Tue 8 AM for the viewer
        zone: VIEWER,
        schoolZone: SCHOOL,
      });
      expect(screen.getByText('Sprint 4 starts today')).toBeInTheDocument();
    });
  });
});
