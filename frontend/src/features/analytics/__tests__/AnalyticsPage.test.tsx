import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/client';
import type { ApiAnalyticsDashboard, ApiAnalyticsScope } from '@/lib/api/types';
import { breakdownColumns } from '../components/BreakdownTable';
import { dateLabel } from '../utils/analyticsFormat';
import { downloadCsv } from '../utils/csv';
import sample from './fixtures/dashboard.json';
import sampleEmpty from './fixtures/dashboard.empty.json';

const getAnalyticsScope = vi.fn<() => Promise<ApiAnalyticsScope>>();
const getAnalyticsDashboard = vi.fn<(q: unknown) => Promise<ApiAnalyticsDashboard>>();
vi.mock('@/lib/api', () => ({ api: { getAnalyticsScope: () => getAnalyticsScope(), getAnalyticsDashboard: (q: unknown) => getAnalyticsDashboard(q) } }));
const auth = { canCreateClasses: false };
vi.mock('@/lib/auth', () => ({ useAuth: () => auth }));
vi.mock('../utils/csv', async (importOriginal) => ({ ...(await importOriginal<typeof import('../utils/csv')>()), downloadCsv: vi.fn() }));

import AnalyticsPage from '../pages/AnalyticsPage';

const DASHBOARD = sample as unknown as ApiAnalyticsDashboard;
const EMPTY = sampleEmpty as unknown as ApiAnalyticsDashboard;
const SCOPE: ApiAnalyticsScope = {
  institutions: [{ id: DASHBOARD.meta.institution.id, name: DASHBOARD.meta.institution.name, slug: 'ucsc', timezone: 'America/Los_Angeles', access: 'instructor',
    classes: [{ id: 'c1', name: 'CSE 115A', term: 'Fall 2026', start_date: '2026-09-21', label: 'CSE 115A · Fall 2026' }] }],
};
const renderPage = (path = `/app/analytics?institution=${DASHBOARD.meta.institution.id}`) =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/app/analytics" element={<AnalyticsPage />} /></Routes></MemoryRouter>);
const tile = (label: string) => screen.getByText(label).closest('.metric-card') as HTMLElement;
const card = (title: RegExp) => screen.getByRole('heading', { name: title }).closest('.gt-chart-card') as HTMLElement;
const unavailable = () => new ApiError(503, 'Service unavailable', 'Request failed with status 503', 'database_unavailable');

beforeEach(() => {
  auth.canCreateClasses = false;
  getAnalyticsScope.mockResolvedValue(SCOPE);
  getAnalyticsDashboard.mockResolvedValue(DASHBOARD);
});
afterEach(() => vi.resetAllMocks()); // also drops queued ...Once answers a failing test left unused

describe('AnalyticsPage', () => {
  it('renders the tiles and cards from one payload, without any timeliness card', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(DASHBOARD.meta.institution.name)).toBeInTheDocument());
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Messages').closest('.metric-card')).toBeTruthy();
    await waitFor(() => expect(within(tile('Classes')).getByText('4')).toBeInTheDocument()); // the payload's figures, not skeletons
    expect(within(tile('Messages')).getByText('1,284')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Conversations/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Scrum board/ })).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Trends/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /By class/ })).toBeInTheDocument();
    expect(screen.queryByText(/Timeliness/)).toBeNull();
    expect(screen.queryByText(/On time/)).toBeNull();
    expect(screen.getByText(/Aggregates only\. No individual student is identified/)).toBeInTheDocument();
  });
  it('keeps each date of the Messages comparison whole, so a narrow tile never breaks it inside a date', async () => {
    renderPage();
    await waitFor(() => expect(within(tile('Messages')).getByText('1,284')).toBeInTheDocument());
    // textContent: Testing Library's text matcher would read a no-break space as a space
    expect(within(tile('Messages')).getByText(/^vs previous/).textContent).toBe('vs previous Aug 7 – Sep 5');
  });
  it('switches the scrum unit without a request and keeps the other cards', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Points' })).toBeInTheDocument());
    const calls = getAnalyticsDashboard.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Points' }));
    expect(screen.getByRole('button', { name: 'Points' })).toHaveAttribute('aria-pressed', 'true');
    expect(getAnalyticsDashboard.mock.calls.length).toBe(calls);
  });
  it('lists the board by sprint as a table in the active unit', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Scrum board/ })).toBeInTheDocument());
    const board = card(/Scrum board/);
    await userEvent.click(within(board).getByRole('button', { name: 'Board as a table' }));
    expect(within(board).getByRole('columnheader', { name: 'In progress' })).toBeInTheDocument();
    const cells = () => {
      const row = within(board).getByRole('rowheader', { name: 'Sprint 1' }).closest('tr') as HTMLElement;
      return [within(row).getByRole('rowheader'), ...within(row).getAllByRole('cell')].map((c) => c.textContent);
    };
    expect(cells()).toEqual(['Sprint 1', '23', '11', '6', '118']);
    await userEvent.click(within(board).getByRole('button', { name: 'Points' }));
    expect(cells()).toEqual(['Sprint 1', '23', '19', '13', '226']); // the same rows in points
    expect(within(board).getByRole('table', { name: 'Story points on the board by sprint' })).toBeInTheDocument();
  });
  it('lists the conversations week by week as a table', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/1,284 messages/)).toBeInTheDocument());
    const conv = card(/Conversations/);
    await userEvent.click(within(conv).getByRole('button', { name: 'Conversations as a table' }));
    const table = within(conv).getByRole('table', { name: 'Messages per week' });
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(DASHBOARD.conversations.weekly.map((w) => dateLabel(w.week_start)));
    const first = within(table).getByRole('rowheader', { name: 'Sep 7, 2026' }).closest('tr') as HTMLElement;
    expect(within(first).getAllByRole('cell').map((c) => c.textContent)).toEqual(['21', '40']);
  });
  it('lists the trends week by week as a table, one column per panel', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/1,284 messages/)).toBeInTheDocument());
    const trends = card(/Trends/);
    const compare = within(trends).getByRole('checkbox', { name: 'Compare with previous range' });
    await userEvent.click(within(trends).getByRole('button', { name: 'Trends as a table' }));
    const table = within(trends).getByRole('table', { name: 'Trends by week' });
    const panels = DASHBOARD.trends.panels;
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Week', ...panels.map((p) => `${p.title} (${p.unit})`)]);
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(panels[0].current.map((c) => dateLabel(c.week_start)));
    const first = within(table).getByRole('rowheader', { name: 'Sep 14, 2026' }).closest('tr') as HTMLElement;
    expect(within(first).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2.5', '2.9', '2.1', '91%']);
    expect(compare).toBeDisabled(); // the table lists this range only
    expect(getAnalyticsDashboard).toHaveBeenCalledTimes(1);
  });
  it('puts a failed section into its card as an inline error and leaves the others alone', async () => {
    getAnalyticsDashboard.mockResolvedValue({ ...DASHBOARD, failures: ['scrum'] });
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const scrum = screen.getByRole('heading', { name: /Scrum board/ }).closest('.gt-chart-card') as HTMLElement;
    expect(within(scrum).getByRole('alert')).toBeInTheDocument();
    const conv = screen.getByRole('heading', { name: /Conversations/ }).closest('.gt-chart-card') as HTMLElement;
    expect(within(conv).queryByRole('alert')).toBeNull();
  });
  it('puts "Could not load" only under a tile whose own figure is missing', async () => {
    // the backend's list for a failed board, with one figure of the overview null
    getAnalyticsDashboard.mockResolvedValue({ ...DASHBOARD, overview: { ...DASHBOARD.overview, teams: null }, failures: ['breakdown', 'overview', 'scrum'] });
    renderPage();
    await waitFor(() => expect(within(tile('Classes')).getByText('4')).toBeInTheDocument());
    expect(screen.getAllByText('Could not load')).toHaveLength(1);
    expect(within(tile('Teams')).getByText('Could not load')).toBeInTheDocument();
    expect(within(tile('Teams')).getByText('—')).toBeInTheDocument();
    expect(within(tile('Active users (7d)')).getByText('People of the school who signed in at least once in the last seven days.')).toBeInTheDocument();
  });
  it('leaves the footnote off a card whose section failed', async () => {
    // the backend's list for failed conversations, whose counts arrive as null
    getAnalyticsDashboard.mockResolvedValue({
      ...DASHBOARD,
      overview: { ...DASHBOARD.overview, messages: null },
      conversations: { ...DASHBOARD.conversations, total: null, team_members: null, dm: null },
      failures: ['conversations', 'overview', 'breakdown'],
    });
    renderPage();
    await waitFor(() => expect(within(card(/Conversations/)).getByRole('alert')).toBeInTheDocument());
    expect(within(card(/Conversations/)).queryByText(/messages ·/)).toBeNull();
    expect(within(card(/Scrum board/)).getByText(/61 stories \(188 pts\)/)).toBeInTheDocument();
  });
  it('shows every card\'s empty state and tiles of 0 or "—" for a school with nothing yet', async () => {
    getAnalyticsDashboard.mockResolvedValue({ ...EMPTY, failures: [] }); // the handoff's file marks the board failed; here every section answered
    renderPage();
    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
    expect(screen.getByText('No sprints yet')).toBeInTheDocument();
    expect(screen.getByText('Trends appear after the first nightly rollup.')).toBeInTheDocument();
    expect(screen.getByText('Nothing to list')).toBeInTheDocument();
    expect(within(tile('Classes')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Teams')).getByText('0')).toBeInTheDocument();
    expect(within(tile('Students')).getByText('0')).toBeInTheDocument();
    expect(within(tile('Active users (7d)')).getByText('—')).toBeInTheDocument();
    expect(within(tile('Active users (7d)')).getByText('Appears once sign-ins are recorded')).toBeInTheDocument();
    expect(within(tile('Messages')).getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Could not load')).toBeNull();
  });
  it('exports the breakdown as CSV named after the school and the range, in the table\'s columns', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, csv] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toBe('analytics-ucsc-2026-09-06-2026-10-05.csv');
    const [header, first] = csv.split('\r\n');
    expect(header).toBe(breakdownColumns('class').map((c) => c.label).join(','));
    expect(first).toBe('CSE 115A,8,41,228,24,118,61%');
  });
  it('asks for fresh figures on Refresh', async () => {
    renderPage();
    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    await waitFor(() => expect(refresh).toBeEnabled());
    await userEvent.click(refresh);
    expect(getAnalyticsDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ fresh: true }));
  });
  it('says so when a request fails, keeping the previous figures when it has them', async () => {
    getAnalyticsDashboard
      .mockResolvedValueOnce(DASHBOARD)
      .mockRejectedValueOnce(new ApiError(422, 'to must be on or after from', 'Request failed with status 422'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Conversations/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('radio', { name: '7d' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The latest request failed (HTTP 422). Showing the previous figures.'));
    expect(screen.getByRole('heading', { name: /Conversations/ })).toBeInTheDocument(); // the previous frame stays
  });
  it('keeps the failure strip while a retry is in flight', async () => {
    getAnalyticsDashboard
      .mockResolvedValueOnce(DASHBOARD)
      .mockRejectedValueOnce(new ApiError(422, 'to must be on or after from', 'Request failed with status 422'))
      .mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await waitFor(() => expect(screen.getByText(/1,284 messages/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('radio', { name: '7d' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The latest request failed (HTTP 422).'));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(getAnalyticsDashboard).toHaveBeenCalledTimes(3); // the retry is in flight
    expect(screen.getByRole('alert')).toHaveTextContent('The latest request failed (HTTP 422). Showing the previous figures.');
  });

  it('shows every card as failed when the very first load fails', async () => {
    getAnalyticsDashboard.mockRejectedValue(new ApiError(404, 'institution does not exist', 'Request failed with status 404'));
    renderPage();
    await waitFor(() => expect(screen.getAllByText('This card could not load.').length).toBeGreaterThan(0));
    expect(screen.getAllByText('This card could not load.')).toHaveLength(4); // every chart card
    expect(screen.getAllByText('Could not load')).toHaveLength(5); // every tile ("—" with the hint)
    // An alert's name never comes from its text, so the page's strip is found by its words: no previous figures to keep.
    expect(screen.getByText('The latest request failed (HTTP 404).')).toHaveAttribute('role', 'alert');
  });
  it('keeps every failed card and tile while a retry is in flight, so the alerts are not announced again', async () => {
    getAnalyticsDashboard
      .mockRejectedValueOnce(new ApiError(404, 'institution does not exist', 'Request failed with status 404'))
      .mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(5));
    const alerts = screen.getAllByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(getAnalyticsDashboard).toHaveBeenCalledTimes(2); // the retry is in flight
    const during = screen.getAllByRole('alert');
    expect(during).toHaveLength(alerts.length);
    during.forEach((node, i) => expect(node).toBe(alerts[i])); // the same nodes, never unmounted
    expect(screen.getAllByText('Could not load')).toHaveLength(5); // the tiles keep their hint, not skeletons
  });
  it('shows a failed scope request as a failed load and recovers on Refresh', async () => {
    let answerScope!: (s: ApiAnalyticsScope) => void;
    getAnalyticsScope
      .mockRejectedValueOnce(unavailable())
      .mockImplementationOnce(() => new Promise((res) => { answerScope = res; }));
    const { container } = renderPage('/app/analytics');
    await waitFor(() => expect(screen.getByText('The latest request failed (HTTP 503).')).toHaveAttribute('role', 'alert'));
    expect(screen.getAllByText('This card could not load.')).toHaveLength(4);
    expect(screen.getAllByText('Could not load')).toHaveLength(5);
    expect(getAnalyticsDashboard).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(container.querySelector('.gt-analytics')).toHaveAttribute('aria-busy', 'true'); // the scope is asked again
    await act(async () => answerScope(SCOPE));
    expect(await screen.findByText(/1,284 messages/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('says the server could not be reached when the scope request gets no answer', async () => {
    getAnalyticsScope.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderPage('/app/analytics');
    expect(await screen.findByText('The server could not be reached.')).toHaveAttribute('role', 'alert');
  });
  it('is busy while the scope loads from the sidebar link', () => {
    getAnalyticsScope.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage('/app/analytics');
    expect(container.querySelector('.gt-analytics')).toHaveAttribute('aria-busy', 'true');
  });

  it('tells a refused account who the page is for', async () => {
    getAnalyticsDashboard.mockRejectedValue(new ApiError(403, 'Analytics is available to instructors and maintainers', 'Request failed with status 403'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Analytics is available to instructors and maintainers.')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /Conversations/ })).toBeNull();
  });
  it('adds no main landmark of its own, refused or not: the app shell has the one main', async () => {
    const inShell = () => render(<main><MemoryRouter initialEntries={[`/app/analytics?institution=${DASHBOARD.meta.institution.id}`]}><Routes><Route path="/app/analytics" element={<AnalyticsPage />} /></Routes></MemoryRouter></main>);
    inShell();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Conversations/ })).toBeInTheDocument());
    expect(screen.getAllByRole('main')).toHaveLength(1);
    cleanup();
    getAnalyticsDashboard.mockRejectedValue(new ApiError(403, 'Analytics is available to instructors and maintainers', 'Request failed with status 403'));
    inShell();
    await waitFor(() => expect(screen.getByText('Analytics is available to instructors and maintainers.')).toBeInTheDocument());
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
  it('says so when the account has no institutions at all', async () => {
    getAnalyticsScope.mockResolvedValue({ institutions: [] });
    renderPage('/app/analytics');
    await waitFor(() => expect(screen.getByText('Analytics is available to instructors and maintainers.')).toBeInTheDocument());
    expect(getAnalyticsDashboard).not.toHaveBeenCalled();
  });
  it('tells an instructor with no class yet when analytics appears', async () => {
    auth.canCreateClasses = true;
    getAnalyticsScope.mockResolvedValue({ institutions: [] });
    renderPage('/app/analytics');
    expect(await screen.findByText('Analytics appears once you teach a class.')).toBeInTheDocument();
    expect(screen.queryByText('Analytics is available to instructors and maintainers.')).toBeNull();
  });
});
