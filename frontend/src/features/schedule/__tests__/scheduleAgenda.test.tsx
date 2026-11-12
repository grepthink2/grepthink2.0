import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { cssRules } from '@/test/cssRules';
import '@features/app/AppView.scss';
import { ScheduleAgenda, type ScheduleAgendaProps } from '../components/ScheduleAgenda';
import type { ScheduleItemData, ScheduleKind } from '../scheduleModel';

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

/** The agenda with the kind chips on: they hold their own selection, as a page would. */
function WithChips(props: Omit<ScheduleAgendaProps, 'kinds' | 'onKindsChange'>) {
  const [kinds, setKinds] = useState<ScheduleKind[]>([]);
  return <ScheduleAgenda {...props} kinds={kinds} onKindsChange={setKinds} />;
}

function renderAgenda(props: Partial<ScheduleAgendaProps> = {}, { chips = false } = {}) {
  const base: ScheduleAgendaProps = {
    items: [],
    status: 'ready',
    now: NOW,
    zone: ZONE,
    schoolZone: ZONE,
    lens: 'student',
    weekAnchor: '2026-11-10',
    onWeekChange: vi.fn(),
    ...props,
  };
  return render(
    <MemoryRouter initialEntries={['/app/home']}>
      <Routes>
        <Route path="*" element={<>{chips ? <WithChips {...base} /> : <ScheduleAgenda {...base} />}<Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ScheduleAgenda', () => {
  it('has no kind chips unless it is given a way to change them', () => {
    renderAgenda({ items: [ta()] });
    expect(screen.queryByRole('group', { name: 'Filter by kind' })).not.toBeInTheDocument();
  });

  it('narrows the week by kind and clears the filters', () => {
    renderAgenda(
      { items: [at('Planning', '2026-11-11T18:00:00Z'), at('TSR 4 due', '2026-11-14T07:59:00Z', { kind: 'deadline', endsAt: null })] },
      { chips: true },
    );
    const chips = screen.getByRole('group', { name: 'Filter by kind' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'TA meetings', 'Meetings', 'Final reviews', 'Deadlines', 'Sprints',
    ]);
    fireEvent.click(within(chips).getByRole('button', { name: 'Deadlines' }));
    expect(screen.queryByText('Planning')).not.toBeInTheDocument();
    expect(screen.getByText('TSR 4 due')).toBeInTheDocument();
    fireEvent.click(within(chips).getByRole('button', { name: 'Deadlines' }));
    fireEvent.click(within(chips).getByRole('button', { name: 'Final reviews' }));
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('TSR 4 due')).toBeInTheDocument();
  });

  it('starts the week at the day it is given, when that day is in the week', () => {
    const { unmount } = renderAgenda({ items: [at('Kickoff', '2026-11-09T18:00:00Z'), ta()], startDay: '2026-11-10' });
    expect(screen.queryByText('Kickoff')).not.toBeInTheDocument();
    expect(screen.getByText('Nov 10 – 15')).toBeInTheDocument();
    unmount();
    renderAgenda({ items: [at('Planning', '2026-11-16T18:00:00Z')], weekAnchor: '2026-11-16', startDay: '2026-11-10' });
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Nov 16 – 22')).toBeInTheDocument();
  });

  it('steps a week from its Monday, and comes back to this week', () => {
    const onWeekChange = vi.fn();
    renderAgenda({ weekAnchor: '2026-11-17', startDay: '2026-11-10', onWeekChange });
    const week = within(screen.getByRole('group', { name: 'Week' })).getAllByRole('button');
    fireEvent.click(week[0]);
    fireEvent.click(week[2]);
    fireEvent.click(week[1]);
    expect(onWeekChange.mock.calls).toEqual([['2026-11-09'], ['2026-11-23'], [null]]);
  });

  it('draws today’s sprint edge as a rule above the day’s rows, not as a row', () => {
    const sprint: ScheduleItemData = {
      id: 's', kind: 'sprint', title: 'Sprint 4', startsAt: '2026-11-10T08:00:00Z', endsAt: null, allDay: true,
      sprint: { name: 'Sprint 4', edge: 'end' },
    };
    renderAgenda({ items: [sprint, ta()] });
    expect(screen.getByText('Sprint 4 ends today')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Today' })).queryByText(/Sprint 4/)).not.toBeInTheDocument();
  });

  it('offers staff a Mark attendance link to TA Meetings on a live TA meeting, and students none', () => {
    const { unmount } = renderAgenda({ items: [ta()], lens: 'ta' });
    expect(screen.getByRole('link', { name: 'Mark attendance' })).toHaveAttribute('href', '/app/ta-meetings');
    unmount();
    renderAgenda({ items: [ta()], lens: 'student' });
    expect(screen.queryByRole('link', { name: 'Mark attendance' })).not.toBeInTheDocument();
  });

  it('shows a student their own attendance on a past TA meeting', () => {
    renderAgenda({ items: [ta({ startsAt: '2026-11-10T17:00:00Z', endsAt: '2026-11-10T17:30:00Z', attendance: 'late' })] });
    expect(screen.getByText('Late')).toBeInTheDocument();
  });

  it('opens a deadline in the app', () => {
    renderAgenda({ items: [at('TSR 4 due', '2026-11-11T07:59:00Z', { kind: 'deadline', endsAt: null, href: '/app/assignments/a1' })] });
    fireEvent.click(screen.getByRole('link', { name: 'TSR 4 due' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app/assignments/a1');
  });

  describe('an all-day item lists on the school’s calendar day, wherever the viewer is', () => {
    // The school is at UTC-5 and the viewer at UTC-8. Sprint 4 starts on Tue Nov 10 at the school,
    // whose midnight is 9 PM on Monday for the viewer.
    const sprint: ScheduleItemData = {
      id: 's4', kind: 'sprint', title: 'Sprint 4', startsAt: '2026-11-10T05:00:00Z', endsAt: null, allDay: true,
      date: '2026-11-10', sprint: { name: 'Sprint 4', edge: 'start' },
    };

    it('is Tuesday’s, not the viewer’s Monday evening', () => {
      renderAgenda({
        items: [sprint, at('Late call', '2026-11-10T06:30:00Z')],
        now: new Date('2026-11-10T06:00:00Z'), // Mon 10 PM for the viewer
        weekAnchor: '2026-11-09',
        schoolZone: 'Etc/GMT+5',
      });
      const monday = document.getElementById('gt-sched-day-2026-11-09')?.closest('.gt-sched__day') as HTMLElement;
      expect(within(monday).getByText('Late call')).toBeInTheDocument();
      expect(within(monday).queryByText(/Sprint 4 starts/)).not.toBeInTheDocument();
      const tuesday = document.getElementById('gt-sched-day-2026-11-10')?.closest('.gt-sched__day') as HTMLElement;
      expect(within(tuesday).getByText(/Sprint 4 starts/)).toBeInTheDocument();
    });
  });
});

describe('agenda styles', () => {
  const OFFSET = 'calc(var(--gt-app-header-top, 0px) + var(--gt-app-header-h, 0px))';

  it('sticks day headers under the app header and scrolls a day clear of it', () => {
    expect(cssRules('.gt-sched--agenda .gt-sched-day').map((r) => r.getPropertyValue('top')).filter(Boolean)).toEqual([OFFSET]);
    expect(cssRules('.gt-sched--agenda .gt-sched__day').map((r) => r.getPropertyValue('scroll-margin-top')).filter(Boolean)).toEqual([OFFSET]);
  });

  it('knows the header’s height and where it sits, in and out of the preview', () => {
    const [view] = cssRules('.app-view');
    expect(view.getPropertyValue('--gt-app-header-h').trim()).toBe('64px');
    expect(view.getPropertyValue('--gt-app-header-top').trim()).toBe('0px');
    expect(cssRules('.app-view--previewing')[0].getPropertyValue('--gt-app-header-top').trim()).toBe('44px');
  });

  it('gives the kind chips 44px on phones', () => {
    const phone = cssRules('.gt-sched__filters .gt-filter-chip', 'max-width: 767px');
    expect(phone.map((r) => r.getPropertyValue('min-height'))).toContain('44px');
  });
});
