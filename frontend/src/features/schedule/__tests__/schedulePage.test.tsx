import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiSchedule, ApiScheduleItem } from '@/lib/api';

const api = vi.hoisted(() => ({ getSchedule: vi.fn(), getInstitutions: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));
const classContext = vi.hoisted(() => ({
  selectedClass: { id: 'c1', name: 'CSE 115A', institution: { id: 'school', name: 'Test U', slug: 'test' } } as unknown,
}));
vi.mock('@/lib/classContext', () => ({ useClass: () => classContext }));
const preview = vi.hoisted(() => ({ isPreviewing: false }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => preview }));

import { clearInstitutionsCache } from '@/lib/institutions';
import SchedulePage from '../pages/SchedulePage';

/** Tue Nov 10, 2026, 3:12 PM at UTC-8. */
const NOW = new Date('2026-11-10T23:12:00Z');

function schoolAt(zone: string) {
  api.getInstitutions.mockResolvedValue([{ id: 'school', name: 'Test U', slug: 'test', email_domains: [], timezone: zone }]);
}
/** The browser's own zone, which the page reads through `viewerZone()`. */
let viewer = 'Etc/GMT+8';
const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
function viewerIn(zone: string) {
  viewer = zone;
}

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

function renderPage(entry = '/app/schedule') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={<><SchedulePage /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const lastRange = () => {
  const [, from, to] = api.getSchedule.mock.lastCall as [string, Date, Date];
  return [from.toISOString(), to.toISOString()];
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  clearInstitutionsCache();
  api.getSchedule.mockReset();
  schoolAt('Etc/GMT+8');
  viewerIn('Etc/GMT+8');
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function patched(this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone: viewer };
  });
  preview.isPreviewing = false;
  classContext.selectedClass = { id: 'c1', name: 'CSE 115A', institution: { id: 'school', name: 'Test U', slug: 'test' } };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SchedulePage', () => {
  it('switches weeks, asks for each week, and goes back with Back', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' })]));
    renderPage();
    expect(await screen.findByText('Standup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This week' })).toBeDisabled();
    expect(screen.getByText('Nov 9 – 15')).toBeInTheDocument();
    expect(lastRange()).toEqual(['2026-11-09T08:00:00.000Z', '2026-11-16T08:00:00.000Z']);

    const week = screen.getByRole('group', { name: 'Week' });
    fireEvent.click(within(week).getAllByRole('button')[2]); // the › arrow, "Next week"
    await waitFor(() => expect(screen.getByText('Nov 16 – 22')).toBeInTheDocument());
    expect(within(week).getAllByRole('button')[1]).toHaveTextContent('Next week');
    expect(within(week).getAllByRole('button')[1]).toBeEnabled();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/schedule?day=2026-11-16');
    expect(lastRange()).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-23T08:00:00.000Z']);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'This week' })).toBeDisabled());
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/schedule$/);
  });

  it('narrows the week by kind and clears the filters', async () => {
    api.getSchedule.mockResolvedValue(
      answer([
        item({ id: 'Planning', starts_at: '2026-11-11T18:00:00Z' }),
        item({ id: 'TSR 4 due', kind: 'deadline', starts_at: '2026-11-14T07:59:00Z', ends_at: null }),
      ]),
    );
    renderPage();
    expect(await screen.findByText('Planning')).toBeInTheDocument();
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

  it('opens ?day= on its week, shows that day and scrolls to it', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Retro', starts_at: '2026-11-17T18:00:00Z' })]));
    renderPage('/app/schedule?day=2026-11-19');
    expect(await screen.findByText('Retro')).toBeInTheDocument();
    expect(lastRange()).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-23T08:00:00.000Z']);
    const thursday = document.getElementById('gt-sched-day-2026-11-19');
    expect(thursday).toHaveTextContent('Thursday');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toBe(thursday);
  });

  it('falls back to this week for a ?day= that is not a day', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' })]));
    renderPage('/app/schedule?day=2026-02-30');
    expect(await screen.findByText('Standup')).toBeInTheDocument();
    expect(lastRange()).toEqual(['2026-11-09T08:00:00.000Z', '2026-11-16T08:00:00.000Z']);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("draws the Now line on today, before the row that hasn't ended", async () => {
    api.getSchedule.mockResolvedValue(
      answer([
        item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' }),
        item({ id: 'Review', starts_at: '2026-11-10T23:00:00Z', zoom_url: 'https://zoom.example/1' }),
      ]),
    );
    renderPage();
    const today = await screen.findByRole('list', { name: 'Today' });
    const rows = within(today).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('aria-label') ?? r.querySelector('.gt-sched-item__title')?.textContent)).toEqual([
      'Standup', 'Now, 3:12 PM', 'Review',
    ]);
    expect(within(rows[2]).getByRole('link', { name: 'Join Zoom' })).toBeInTheDocument();
  });

  it('offers a quiet Zoom link before the join window', async () => {
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Planning', starts_at: '2026-11-11T18:00:00Z', zoom_url: 'https://zoom.example/2' })]));
    renderPage();
    const link = await screen.findByRole('link', { name: 'Zoom' });
    expect(link).toHaveAttribute('href', 'https://zoom.example/2');
    expect(link).not.toHaveClass('gt-sched-item__action--primary');
  });

  it('lists a late-evening campus item under the viewer’s own day, and says where times are', async () => {
    viewerIn('Etc/GMT-5'); // UTC+5: NOW is Wed Nov 11, 4:12 AM
    // 11 PM on Wed Nov 11 on campus (UTC-8) is noon on Thu Nov 12 here.
    api.getSchedule.mockResolvedValue(answer([item({ id: 'Late sync', starts_at: '2026-11-12T07:00:00Z' })]));
    renderPage();
    const tomorrow = await screen.findByRole('list', { name: 'Tomorrow' });
    expect(within(tomorrow).getByText('Late sync')).toBeInTheDocument();
    const range = tomorrow.querySelector('.gt-sched-item__range');
    expect(range).toHaveTextContent('12:00 – 12:30 PM');
    expect(range).toHaveAttribute('title', '11:00 – 11:30 PM GMT-8');
    await waitFor(() => expect(screen.getByText('Times in GMT+5 · campus is GMT-8')).toBeInTheDocument());
  });

  it('says an empty week is empty and names what comes next, from one look-ahead', async () => {
    api.getSchedule
      .mockResolvedValueOnce(answer([]))
      .mockResolvedValueOnce(
        answer([
          item({ id: 'review', kind: 'final_review', title: 'Final review', team_name: 'Alpha', starts_at: '2026-11-20T22:00:00Z' }),
        ]),
      );
    renderPage();
    expect(await screen.findByText('Nothing scheduled this week')).toBeInTheDocument();
    expect(await screen.findByText('Next up: Final review · Alpha · Friday, Nov 20 · 2:00 PM')).toBeInTheDocument();
    expect(api.getSchedule).toHaveBeenCalledTimes(2);
    expect(lastRange()).toEqual(['2026-11-16T08:00:00.000Z', '2026-12-28T08:00:00.000Z']);
  });

  it('fails quietly and loads again on try again', async () => {
    api.getSchedule.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(answer([item({ id: 'Standup', starts_at: '2026-11-10T17:00:00Z' })]));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load your schedule');
    fireEvent.click(screen.getByRole('button', { name: 'try again' }));
    expect(await screen.findByText('Standup')).toBeInTheDocument();
  });

  it('asks for a class, and asks nothing, with none selected', () => {
    classContext.selectedClass = null;
    renderPage();
    expect(screen.getByText('No class selected')).toBeInTheDocument();
    expect(api.getSchedule).not.toHaveBeenCalled();
  });

  it('says the schedule is not part of the student preview, and asks nothing', () => {
    preview.isPreviewing = true;
    renderPage();
    expect(screen.getByText("The schedule isn't part of the student preview.")).toBeInTheDocument();
    expect(api.getSchedule).not.toHaveBeenCalled();
  });
});
