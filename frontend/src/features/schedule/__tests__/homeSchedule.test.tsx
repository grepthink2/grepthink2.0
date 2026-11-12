import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiSchedule, ApiScheduleItem } from '@/lib/api';

const api = vi.hoisted(() => ({ getSchedule: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

import HomeSchedule, { type HomeScheduleProps } from '../components/HomeSchedule';
import { ScheduleRedirect } from '../components/ScheduleRedirect';

/** The school and, unless a test says otherwise, the viewer: UTC-8 all year. */
const ZONE = 'Etc/GMT+8';
/** Tue Nov 10, 2026, 3:12 PM at UTC-8. */
const NOW = new Date('2026-11-10T23:12:00Z');

const item = (over: Partial<ApiScheduleItem> & { id: string; starts_at: string }): ApiScheduleItem => ({
  kind: 'meeting',
  title: over.id,
  ends_at: new Date(new Date(over.starts_at).getTime() + 30 * 60_000).toISOString(),
  all_day: false,
  ...over,
});
const answer = (items: ApiScheduleItem[], lens: ApiSchedule['lens'] = 'student'): ApiSchedule => ({ lens, items });

function Where() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="where">{location.pathname + location.search}</span>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

function tree(entry: string, props: Partial<HomeScheduleProps>) {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/schedule" element={<ScheduleRedirect />} />
        <Route
          path="/app/home"
          element={
            <>
              <HomeSchedule classId="c1" schoolZone={ZONE} now={NOW} zone={ZONE} {...props} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function renderHome(entry = '/app/home', props: Partial<HomeScheduleProps> = {}) {
  const result = render(tree(entry, props));
  return { ...result, rerenderWith: (next: Partial<HomeScheduleProps>) => result.rerender(tree(entry, next)) };
}

const lastRange = () => {
  const [, from, to] = api.getSchedule.mock.lastCall as [string, Date, Date];
  return [from.toISOString(), to.toISOString()];
};
const weekButtons = () => within(screen.getByRole('group', { name: 'Week' })).getAllByRole('button');

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  api.getSchedule.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HomeSchedule', () => {
  it('shows this week from today on: what was before today stays out, today and the days after it are in', async () => {
    api.getSchedule.mockResolvedValue(
      answer([
        item({ id: 'Kickoff', starts_at: '2026-11-09T18:00:00Z' }), // Monday, yesterday
        item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' }), // today
        item({ id: 'Retro', starts_at: '2026-11-15T20:00:00Z' }), // Sunday
      ]),
    );
    renderHome();
    expect(await screen.findByText('Standup')).toBeInTheDocument();
    expect(screen.getByText('Retro')).toBeInTheDocument();
    expect(screen.queryByText('Kickoff')).not.toBeInTheDocument();
    expect(document.getElementById('gt-sched-day-2026-11-09')).toBeNull();
    expect(screen.getByRole('button', { name: 'This week' })).toBeDisabled();
    expect(screen.getByText('Nov 10 – 15')).toBeInTheDocument();
    expect(lastRange()).toEqual(['2026-11-10T08:00:00.000Z', '2026-11-16T08:00:00.000Z']);
  });

  it('has no kind chips on Home, and keeps the week switcher and the range', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' })]));
    renderHome();
    expect(await screen.findByText('Standup')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter by kind' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Week' })).toBeInTheDocument();
  });

  it('switches weeks, shows another week Monday to Sunday, asks for each week, and goes back with Back', async () => {
    api.getSchedule.mockResolvedValue(
      answer([
        item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' }),
        item({ id: 'Planning', starts_at: '2026-11-16T18:00:00Z' }), // next Monday
      ]),
    );
    renderHome();
    expect(await screen.findByText('Standup')).toBeInTheDocument();

    fireEvent.click(weekButtons()[2]); // the › arrow, "Next week"
    await waitFor(() => expect(screen.getByText('Nov 16 – 22')).toBeInTheDocument());
    expect(weekButtons()[1]).toHaveTextContent('Next week');
    expect(weekButtons()[1]).toBeEnabled();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/home?day=2026-11-16');
    expect(lastRange()).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-23T08:00:00.000Z']);
    expect(document.getElementById('gt-sched-day-2026-11-16')).toHaveTextContent('Monday');
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'This week' })).toBeDisabled());
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/home$/);

    fireEvent.click(weekButtons()[0]); // the ‹ arrow, "Last week", from the week's Monday
    await waitFor(() => expect(screen.getByText('Nov 2 – 8')).toBeInTheDocument());
    expect(screen.getByTestId('where')).toHaveTextContent('/app/home?day=2026-11-02');
    expect(lastRange()).toEqual(['2026-11-02T08:00:00.000Z', '2026-11-09T08:00:00.000Z']);
  });

  it('opens ?day= on its week, shows that day and scrolls to it', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Retro', starts_at: '2026-11-17T18:00:00Z' })]));
    renderHome('/app/home?day=2026-11-19');
    expect(await screen.findByText('Retro')).toBeInTheDocument();
    expect(lastRange()).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-23T08:00:00.000Z']);
    const thursday = document.getElementById('gt-sched-day-2026-11-19');
    expect(thursday).toHaveTextContent('Thursday');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
    // The day's section, whose scroll margin keeps its heading clear of the app's sticky header.
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toBe(thursday?.closest('.gt-sched__day'));
  });

  it('scrolls to ?day= once: a reload of the week (the clock past midnight) does not scroll again', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Retro', starts_at: '2026-11-13T18:00:00Z' })]));
    const { rerenderWith } = renderHome('/app/home?day=2026-11-13');
    expect(await screen.findByText('Retro')).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
    // Wed Nov 11, 12:05 AM: the week now starts at Wednesday, so it is asked for again.
    rerenderWith({ now: new Date('2026-11-11T08:05:00Z') });
    await waitFor(() => expect(lastRange()).toEqual(['2026-11-11T08:00:00.000Z', '2026-11-16T08:00:00.000Z']));
    expect(await screen.findByText('Retro')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading schedule' })).not.toBeInTheDocument());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('scrolls to ?day= once the week loads after Try again, and only then', async () => {
    api.getSchedule.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(answer([item({ id: 'Retro', starts_at: '2026-11-13T18:00:00Z' })]));
    renderHome('/app/home?day=2026-11-13');
    fireEvent.click(await screen.findByRole('button', { name: 'try again' }));
    expect(await screen.findByText('Retro')).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('lists a live item that began before midnight under Today, with Join Zoom; one that ended stays out', async () => {
    const afterMidnight = new Date('2026-11-11T08:10:00Z'); // Wed Nov 11, 12:10 AM
    api.getSchedule.mockResolvedValue(
      answer([
        item({ id: 'Wrap', starts_at: '2026-11-11T07:00:00Z', ends_at: '2026-11-11T08:05:00Z' }), // Tue 11 PM – 12:05 AM
        item({ id: 'Late sync', starts_at: '2026-11-11T07:30:00Z', ends_at: '2026-11-11T08:45:00Z', zoom_url: 'https://zoom.example/3' }),
      ]),
    );
    renderHome('/app/home', { now: afterMidnight });
    const today = await screen.findByRole('list', { name: 'Today' });
    expect(within(today).getByText('Late sync')).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: 'Join Zoom' })).toHaveAttribute('href', 'https://zoom.example/3');
    expect(screen.queryByText('Wrap')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing else scheduled/)).not.toBeInTheDocument();
    expect(api.getSchedule).toHaveBeenCalledTimes(1);
    expect(lastRange()).toEqual(['2026-11-11T08:00:00.000Z', '2026-11-16T08:00:00.000Z']);
  });

  it('lands an old /app/schedule?day= link on Home, on the same week, scrolled to the day', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Retro', starts_at: '2026-11-17T18:00:00Z' })]));
    renderHome('/app/schedule?day=2026-11-19');
    expect(await screen.findByText('Retro')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/home?day=2026-11-19');
    expect(lastRange()).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-23T08:00:00.000Z']);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('lands a bare /app/schedule on Home’s week', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' })]));
    renderHome('/app/schedule');
    expect(await screen.findByText('Standup')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/home$/);
    expect(lastRange()).toEqual(['2026-11-10T08:00:00.000Z', '2026-11-16T08:00:00.000Z']);
  });

  it('falls back to this week for a ?day= that is not a day', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' })]));
    renderHome('/app/home?day=2026-02-30');
    expect(await screen.findByText('Standup')).toBeInTheDocument();
    expect(lastRange()).toEqual(['2026-11-10T08:00:00.000Z', '2026-11-16T08:00:00.000Z']);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("draws the Now line on today, before the row that hasn't ended", async () => {
    api.getSchedule.mockResolvedValue(
      answer([
        item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' }),
        item({ id: 'Review', starts_at: '2026-11-10T23:00:00Z', zoom_url: 'https://zoom.example/1' }),
      ]),
    );
    renderHome();
    const today = await screen.findByRole('list', { name: 'Today' });
    const rows = within(today).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('aria-label') ?? r.querySelector('.gt-sched-item__title')?.textContent)).toEqual([
      'Standup', 'Now, 3:12 PM', 'Review',
    ]);
    expect(within(rows[2]).getByRole('link', { name: 'Join Zoom' })).toBeInTheDocument();
  });

  it('offers a quiet Zoom link before the join window', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Planning', starts_at: '2026-11-11T18:00:00Z', zoom_url: 'https://zoom.example/2' })]));
    renderHome();
    const link = await screen.findByRole('link', { name: 'Zoom' });
    expect(link).toHaveAttribute('href', 'https://zoom.example/2');
    expect(link).not.toHaveClass('gt-sched-item__action--primary');
  });

  it('lists a late-evening campus item under the viewer’s own day, and says where times are', async () => {
    // UTC+5: NOW is Wed Nov 11, 4:12 AM, and the week starts there.
    // 11 PM on Wed Nov 11 on campus (UTC-8) is noon on Thu Nov 12 here.
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Late sync', starts_at: '2026-11-12T07:00:00Z' })]));
    renderHome('/app/home', { zone: 'Etc/GMT-5' });
    const tomorrow = await screen.findByRole('list', { name: 'Tomorrow' });
    expect(within(tomorrow).getByText('Late sync')).toBeInTheDocument();
    const range = tomorrow.querySelector('.gt-sched-item__range');
    expect(range).toHaveTextContent('12:00 – 12:30 PM');
    expect(range).toHaveAttribute('title', '11:00 – 11:30 PM GMT-8');
    expect(screen.getByText('Times in GMT+5 · campus is GMT-8')).toBeInTheDocument();
    expect(screen.getByText('Nov 11 – 15')).toBeInTheDocument();
    expect(lastRange()).toEqual(['2026-11-10T19:00:00.000Z', '2026-11-15T19:00:00.000Z']);
  });

  it('says an empty week is empty and names what comes next, from one look-ahead', async () => {
    api.getSchedule
      .mockResolvedValueOnce(answer([]))
      .mockResolvedValueOnce(
        answer([
          item({ id: 'review', kind: 'final_review', title: 'Final review', team_name: 'Alpha', starts_at: '2026-11-20T22:00:00Z' }),
        ]),
      );
    renderHome();
    // The week starts at today, so the days before it may have held something.
    expect(await screen.findByText('Nothing else scheduled this week')).toBeInTheDocument();
    expect(await screen.findByText('Next up: Final review · Alpha · Friday, Nov 20 · 2:00 PM')).toBeInTheDocument();
    expect(api.getSchedule).toHaveBeenCalledTimes(2);
    expect(lastRange()).toEqual(['2026-11-16T08:00:00.000Z', '2026-12-28T08:00:00.000Z']);
  });

  it('fails quietly and loads again on try again', async () => {
    api.getSchedule.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(answer([item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' })]));
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load your schedule');
    fireEvent.click(screen.getByRole('button', { name: 'try again' }));
    expect(await screen.findByText('Standup')).toBeInTheDocument();
  });

  it('shows the card’s empty state, and asks nothing, with no class selected', () => {
    renderHome('/app/home', { classId: null });
    expect(screen.getByText('Class events and deadlines will appear here.')).toBeInTheDocument();
    expect(screen.queryByText('No class selected')).not.toBeInTheDocument();
    expect(api.getSchedule).not.toHaveBeenCalled();
  });

  it('says the schedule is not part of the student preview, and asks nothing', () => {
    renderHome('/app/home', { preview: true });
    expect(screen.getByText("The schedule isn't part of the student preview.")).toBeInTheDocument();
    expect(api.getSchedule).not.toHaveBeenCalled();
  });

  it('reads "empty" as the agenda does: an answer of items before today only still looks ahead for Next up', async () => {
    api.getSchedule
      // Starts on Monday Nov 9 at 11:30 PM and runs into today: in the answer, not in the days shown.
      .mockResolvedValueOnce(answer([item({ id: 'Late', starts_at: '2026-11-10T07:30:00Z', ends_at: '2026-11-10T08:30:00Z' })]))
      .mockResolvedValueOnce(answer([item({ id: 'Retro', starts_at: '2026-11-17T18:00:00Z' })]));
    renderHome();
    expect(await screen.findByText('Nothing else scheduled this week')).toBeInTheDocument();
    expect(await screen.findByText(/Next up: Retro/)).toBeInTheDocument();
  });

  it('shows no Next up from another week while this week’s look-ahead loads', async () => {
    const pending = new Promise<ApiSchedule>(() => {});
    api.getSchedule
      .mockResolvedValueOnce(answer([]))
      .mockResolvedValueOnce(answer([item({ id: 'Retro', starts_at: '2026-11-24T18:00:00Z' })]))
      .mockResolvedValueOnce(answer([]))
      .mockReturnValueOnce(pending);
    renderHome();
    expect(await screen.findByText(/Next up: Retro/)).toBeInTheDocument();
    fireEvent.click(weekButtons()[2]);
    expect(await screen.findByText('Nothing scheduled next week')).toBeInTheDocument();
    await waitFor(() => expect(api.getSchedule).toHaveBeenCalledTimes(4));
    expect(screen.queryByText(/Next up/)).not.toBeInTheDocument();
  });

  it('says "Nothing scheduled" under an empty today, never under a day that holds a sprint rule', async () => {
    api.getSchedule.mockResolvedValue(
      answer([
        item({ id: 'edge', kind: 'sprint', title: 'Sprint 4', starts_at: '2026-11-12T08:00:00Z', ends_at: null, all_day: true, date: '2026-11-12', sprint: { name: 'Sprint 4', edge: 'start' } }),
      ]),
    );
    renderHome();
    const thursday = (await screen.findByText('Sprint 4 starts')).closest('.gt-sched__day') as HTMLElement;
    expect(within(thursday).queryByText('Nothing scheduled')).not.toBeInTheDocument();
    const today = document.getElementById('gt-sched-day-2026-11-10')?.closest('.gt-sched__day') as HTMLElement;
    expect(within(today).getByText('Nothing scheduled')).toBeInTheDocument();
  });
});
