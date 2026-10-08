import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/client';
import type { ApiAnalyticsDashboard, ApiAnalyticsScope } from '@/lib/api/types';
import sample from './fixtures/dashboard.json';

const getAnalyticsScope = vi.fn<() => Promise<ApiAnalyticsScope>>();
const getAnalyticsDashboard = vi.fn<(q: unknown) => Promise<ApiAnalyticsDashboard>>();
vi.mock('@/lib/api', () => ({ api: { getAnalyticsScope: () => getAnalyticsScope(), getAnalyticsDashboard: (q: unknown) => getAnalyticsDashboard(q) } }));

import AnalyticsPage from '../pages/AnalyticsPage';

const DASHBOARD = sample as unknown as ApiAnalyticsDashboard;
const SCOPE: ApiAnalyticsScope = {
  institutions: [{ id: DASHBOARD.meta.institution.id, name: DASHBOARD.meta.institution.name, slug: 'ucsc', timezone: 'America/Los_Angeles', access: 'instructor',
    classes: [{ id: 'c1', name: 'CSE 115A', term: 'Fall 2026', start_date: '2026-09-21', label: 'CSE 115A · Fall 2026' }] }],
};
const renderPage = (path = `/app/analytics?institution=${DASHBOARD.meta.institution.id}`) =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/app/analytics" element={<AnalyticsPage />} /></Routes></MemoryRouter>);

beforeEach(() => {
  getAnalyticsScope.mockResolvedValue(SCOPE);
  getAnalyticsDashboard.mockResolvedValue(DASHBOARD);
});
afterEach(() => vi.clearAllMocks());

describe('AnalyticsPage', () => {
  it('renders the tiles and cards from one payload, without any timeliness card', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(DASHBOARD.meta.institution.name)).toBeInTheDocument());
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Messages').closest('.metric-card')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Conversations/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Scrum board/ })).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Trends/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /By class/ })).toBeInTheDocument();
    expect(screen.queryByText(/Timeliness/)).toBeNull();
    expect(screen.queryByText(/On time/)).toBeNull();
    expect(screen.getByText(/Aggregates only\. No individual student is identified/)).toBeInTheDocument();
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
    const card = screen.getByRole('heading', { name: /Scrum board/ }).closest('.gt-chart-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Table' }));
    expect(within(card).getByRole('columnheader', { name: 'In progress' })).toBeInTheDocument();
    const cells = () => within(within(card).getByRole('cell', { name: 'Sprint 1' }).closest('tr') as HTMLElement).getAllByRole('cell').map((c) => c.textContent);
    expect(cells()).toEqual(['Sprint 1', '23', '11', '6', '118']);
    await userEvent.click(within(card).getByRole('button', { name: 'Points' }));
    expect(cells()).toEqual(['Sprint 1', '23', '19', '13', '226']); // the same rows in points
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

  it('shows every card as failed when the very first load fails', async () => {
    getAnalyticsDashboard.mockRejectedValue(new ApiError(404, 'institution does not exist', 'Request failed with status 404'));
    renderPage();
    await waitFor(() => expect(screen.getAllByText('This card could not load.').length).toBeGreaterThan(0));
    expect(screen.getAllByText('This card could not load.')).toHaveLength(4); // every chart card
    expect(screen.getAllByText('Could not load')).toHaveLength(5); // every tile ("—" with the hint)
    // An alert's name never comes from its text, so the page's strip is found by its words: no previous figures to keep.
    expect(screen.getByText('The latest request failed (HTTP 404).')).toHaveAttribute('role', 'alert');
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
});
