import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getScrumSummary: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: { id: 'c1', status: 'active' } }),
  useSelectedClassRole: () => 'student',
}));
// A tab left open across a deploy asks for a chunk the server no longer has.
vi.mock('../components/MoveInModal', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

import MoveInInvite from '../components/MoveInInvite';

afterEach(() => vi.restoreAllMocks());

describe('MoveInInvite when its modal cannot load', () => {
  it('leaves the Home as it was', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.getScrumSummary.mockResolvedValue({
      sprint: null,
      counts: { todo: 0, in_progress: 0, done: 0 },
      backlog_stories: 0,
      story_count: 1,
      connector_ready: true,
    });
    render(
      <>
        <p>Home</p>
        <MoveInInvite projectId="p1" teamName="Team One" />
      </>,
    );

    await waitFor(() => expect(logged).toHaveBeenCalledWith('[ErrorBoundary]', expect.anything(), expect.anything()));
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
