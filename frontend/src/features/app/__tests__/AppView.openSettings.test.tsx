import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// The shell's pieces, down to what this test reads: whether Settings is open, and on which section.
vi.mock('@features/app/components/Layout/Sidebar', () => ({ default: () => null }));
vi.mock('@features/app/components/Layout/Header', () => ({
  default: ({ onOpenSettings }: { onOpenSettings: () => void }) => (
    <button type="button" onClick={onOpenSettings}>
      Open settings
    </button>
  ),
}));
vi.mock('@features/app/components/Layout/PreviewBanner', () => ({ default: () => null }));
vi.mock('@features/app/components/Layout/ClassRouteGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@features/app/pages/Settings', () => ({
  default: ({ isOpen, onClose, initialSection }: { isOpen: boolean; onClose: () => void; initialSection?: string }) =>
    isOpen ? (
      <div role="dialog" aria-label="Settings" data-section={initialSection}>
        <button type="button" onClick={onClose}>
          Close settings
        </button>
      </div>
    ) : null,
}));
vi.mock('@features/messages/components/MessageWidget', () => ({ MessageWidget: () => null }));
vi.mock('@features/search/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@features/search/hooks/useSearchIndex', () => ({ useSearchIndex: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/classContext', () => ({ ClassProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' }, loading: false }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: false }) }));

import AppView from '../AppView';
import { openSettings } from '@/lib/openSettings';

const settings = () => screen.findByRole('dialog', { name: 'Settings' });
const show = () =>
  render(
    <MemoryRouter>
      <AppView />
    </MemoryRouter>,
  );

describe('AppView — a page asking for Settings', () => {
  it('opens Settings on the section the page names', async () => {
    show();
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    act(() => openSettings('email'));
    expect(await settings()).toHaveAttribute('data-section', 'email');
  });

  it('opens on Profile from the header, also after a page asked for another section', async () => {
    show();
    act(() => openSettings('email'));
    fireEvent.click(await screen.findByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(await settings()).toHaveAttribute('data-section', 'profile');
  });

  it('stops listening once it is gone', () => {
    const { unmount } = show();
    unmount();
    expect(() => act(() => openSettings('apps'))).not.toThrow();
  });
});
