import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The shell's pieces, down to what this test reads: whether the phone drawer is open.
vi.mock('@features/app/components/Layout/Sidebar', () => ({
  default: ({ mobileOpen }: { mobileOpen?: boolean }) => <nav aria-label="Sidebar" data-mobile-open={String(Boolean(mobileOpen))} />,
}));
vi.mock('@features/app/components/Layout/Header', () => ({ default: () => null }));
vi.mock('@features/app/components/Layout/PreviewBanner', () => ({ default: () => null }));
vi.mock('@features/app/components/Layout/ClassRouteGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@features/app/pages/Settings', () => ({ default: () => null }));
vi.mock('@features/messages/components/MessageWidget', () => ({ MessageWidget: () => null }));
vi.mock('@features/search/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@features/search/hooks/useSearchIndex', () => ({ useSearchIndex: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/classContext', () => ({ ClassProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' }, loading: false }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: false }) }));

import AppView from '../AppView';
import { openClassSelector } from '@/lib/openClassSelector';

const drawerOpen = () => screen.getByRole('navigation', { name: 'Sidebar' }).getAttribute('data-mobile-open');

function onScreen(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone && query.includes('max-width'), media: query }) as MediaQueryList);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppView — a page asking for the class selector', () => {
  it('opens the phone nav drawer, where the selector sits', () => {
    onScreen(true);
    render(<MemoryRouter><AppView /></MemoryRouter>);
    expect(drawerOpen()).toBe('false');
    act(() => openClassSelector());
    expect(drawerOpen()).toBe('true');
    expect(document.querySelector('.app-nav-backdrop')).not.toBeNull();
  });

  it('leaves the drawer shut on a wider screen, where the sidebar shows the selector', () => {
    onScreen(false);
    render(<MemoryRouter><AppView /></MemoryRouter>);
    act(() => openClassSelector());
    expect(drawerOpen()).toBe('false');
  });
});
