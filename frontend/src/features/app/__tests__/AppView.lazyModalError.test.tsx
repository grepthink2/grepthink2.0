import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

// The shell's pieces, down to what this test reads: the sidebar is there, and its button opens Settings.
vi.mock('@features/app/components/Layout/Sidebar', () => ({
  default: ({ onOpenSettings }: { onOpenSettings: () => void }) => (
    <nav aria-label="Sidebar">
      <button type="button" onClick={onOpenSettings}>Settings</button>
    </nav>
  ),
}));
vi.mock('@features/app/components/Layout/Header', () => ({ default: () => <header>Header</header> }));
vi.mock('@features/app/components/Layout/PreviewBanner', () => ({ default: () => null }));
vi.mock('@features/app/components/Layout/ClassRouteGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// A tab left open across a deploy asks for a Settings chunk the deploy removed.
vi.mock('@features/app/pages/Settings', () => {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/Settings-old.js');
});
vi.mock('@features/messages/components/MessageWidget', () => ({ MessageWidget: () => null }));
vi.mock('@features/search/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@features/search/hooks/useSearchIndex', () => ({ useSearchIndex: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/classContext', () => ({ ClassProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' }, loading: false }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: false }) }));
vi.mock('@/lib/reloadPage', () => ({ reloadPage: vi.fn() }));

import AppView from '../AppView';
import { reloadPage } from '@/lib/reloadPage';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// As in App.tsx: the top-level boundary wraps the whole app.
const renderApp = () =>
  render(
    <ErrorBoundary>
      <MemoryRouter><AppView /></MemoryRouter>
    </ErrorBoundary>,
  );

describe('AppView — a lazy modal whose chunk fails to load', () => {
  it('keeps the shell on screen', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't open this");
    expect(screen.queryByText('Something went wrong')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('says how to recover, with a Reload action', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/reload/i);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});
