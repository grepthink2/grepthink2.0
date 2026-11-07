import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassRole } from '@/lib/api';

const state = vi.hoisted(() => ({
  role: 'student' as ClassRole | null | undefined,
  selectedClass: { id: 'c1', status: 'active' } as { id: string; status?: string } | null,
  isPreviewing: false,
}));
const api = vi.hoisted(() => ({ getScrumSummary: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: state.selectedClass }),
  useSelectedClassRole: () => state.role,
}));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: state.isPreviewing }) }));
// The real modal has tests of its own (moveInModal.test.tsx), and the lazy chunk's failure has
// moveInInvite.chunkFailure.test.tsx. Here the modal renders at once: React holds back a lazy
// chunk's content for a moment, and a test that expects no dialog would pass in that gap.
vi.mock('@/lib/lazyModal', () => ({
  lazyModal:
    () =>
    ({
      open,
      onClose,
      teamName,
      connectorAddress,
    }: {
      open: boolean;
      onClose: () => void;
      teamName?: string;
      connectorAddress: string;
    }) =>
      open ? (
        <div role="dialog" aria-label="Move in">
          {teamName} {connectorAddress}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      ) : null,
}));

import MoveInInvite from '../components/MoveInInvite';
import { isMoveInInviteSettled, settleMoveInInvite } from '../moveInInviteStore';

const NO_COUNTS = { sprint: null, counts: { todo: 0, in_progress: 0, done: 0 }, backlog_stories: 0 };
const summary = (storyCount: number, connectorReady = true) => ({
  ...NO_COUNTS,
  story_count: storyCount,
  connector_ready: connectorReady,
});

/** The store remembers for the page's life, so each test takes its own project. */
let projects = 0;
const newProject = () => `p${++projects}`;

const invite = (projectId: string | null, held = false) => (
  <MoveInInvite projectId={projectId} teamName="Team One" held={held} />
);

/** Lets an answer that has arrived run its handlers. */
const flush = () => act(async () => {});

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  state.role = 'student';
  state.selectedClass = { id: 'c1', status: 'active' };
  state.isPreviewing = false;
});

describe('MoveInInvite', () => {
  it('opens for a student whose team has 2 stories', async () => {
    const project = newProject();
    api.getScrumSummary.mockResolvedValue(summary(2));
    render(invite(project));

    const dialog = await screen.findByRole('dialog', { name: 'Move in' });
    expect(dialog).toHaveTextContent('Team One');
    // The connector's address: this site's, since tests run with no separate API base.
    expect(dialog).toHaveTextContent(`${window.location.origin}/mcp`);
    expect(api.getScrumSummary).toHaveBeenCalledWith(project);
  });

  it('opens for a team with no stories', async () => {
    api.getScrumSummary.mockResolvedValue(summary(0));
    render(invite(newProject()));

    expect(await screen.findByRole('dialog', { name: 'Move in' })).toBeInTheDocument();
  });

  it("stays closed at exactly 3 stories, and doesn't ask again this visit", async () => {
    const project = newProject();
    api.getScrumSummary.mockResolvedValue(summary(3));
    const first = render(invite(project));

    await waitFor(() => expect(isMoveInInviteSettled(project)).toBe(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    first.unmount();

    render(invite(project));
    await flush();
    expect(api.getScrumSummary).toHaveBeenCalledTimes(1);
  });

  it("stays closed when the connector isn't ready, and settles nothing", async () => {
    const project = newProject();
    api.getScrumSummary.mockResolvedValue(summary(1, false));
    render(invite(project));

    await waitFor(() => expect(api.getScrumSummary).toHaveBeenCalled());
    await flush();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(isMoveInInviteSettled(project)).toBe(false);
  });

  it('stays closed when an older backend sends neither field', async () => {
    const project = newProject();
    api.getScrumSummary.mockResolvedValue(NO_COUNTS);
    render(invite(project));

    await waitFor(() => expect(api.getScrumSummary).toHaveBeenCalled());
    await flush();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(isMoveInInviteSettled(project)).toBe(false);
  });

  it('closing settles this visit, and another team is still invited', async () => {
    const user = userEvent.setup();
    const [first, second] = [newProject(), newProject()];
    api.getScrumSummary.mockResolvedValue(summary(1));
    const view = render(invite(first));

    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(isMoveInInviteSettled(first)).toBe(true);
    view.unmount();

    const again = render(invite(first));
    await flush();
    expect(api.getScrumSummary).toHaveBeenCalledTimes(1);
    again.unmount();

    render(invite(second));
    expect(await screen.findByRole('dialog', { name: 'Move in' })).toBeInTheDocument();
  });

  it('shows nothing and settles nothing when the read fails, so the next Home load asks again', async () => {
    const project = newProject();
    api.getScrumSummary.mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce(summary(1));
    const first = render(invite(project));

    await waitFor(() => expect(api.getScrumSummary).toHaveBeenCalledTimes(1));
    await flush();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(isMoveInInviteSettled(project)).toBe(false);
    first.unmount();

    render(invite(project));
    expect(await screen.findByRole('dialog', { name: 'Move in' })).toBeInTheDocument();
  });

  it('opens nothing on an answer that came in after the team changed', async () => {
    const [first, second] = [newProject(), newProject()];
    const answers: Record<string, ((value: unknown) => void)[]> = {};
    api.getScrumSummary.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          (answers[id] ??= []).push(resolve);
        }),
    );
    const view = render(invite(first));
    await waitFor(() => expect(answers[first]).toHaveLength(1));

    // The student picks another team, and then the first team's answer arrives.
    view.rerender(invite(second));
    await act(async () => answers[first][0](summary(1)));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Back on the first team, only its new read may open the invitation.
    view.rerender(invite(first));
    await waitFor(() => expect(answers[first]).toHaveLength(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(isMoveInInviteSettled(first)).toBe(false);

    await act(async () => answers[first][1](summary(1)));
    expect(await screen.findByRole('dialog', { name: 'Move in' })).toBeInTheDocument();
  });

  it('closes when the team on Home goes away', async () => {
    api.getScrumSummary.mockResolvedValue(summary(1));
    const view = render(invite(newProject()));
    expect(await screen.findByRole('dialog', { name: 'Move in' })).toBeInTheDocument();

    view.rerender(invite(null));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits while another dialog holds it, then opens', async () => {
    const project = newProject();
    api.getScrumSummary.mockResolvedValue(summary(1));
    const view = render(invite(project, true));

    await waitFor(() => expect(api.getScrumSummary).toHaveBeenCalled());
    await flush();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    view.rerender(invite(project, false));
    expect(await screen.findByRole('dialog', { name: 'Move in' })).toBeInTheDocument();
  });

  describe('makes no read', () => {
    it.each<ClassRole | null>(['ta', 'instructor', null])('for the class role %s', async (role) => {
      state.role = role;
      render(invite(newProject()));
      await flush();
      expect(api.getScrumSummary).not.toHaveBeenCalled();
    });

    it('while an instructor previews the class as a student', async () => {
      state.isPreviewing = true;
      render(invite(newProject()));
      await flush();
      expect(api.getScrumSummary).not.toHaveBeenCalled();
    });

    it('with no team', async () => {
      render(invite(null));
      await flush();
      expect(api.getScrumSummary).not.toHaveBeenCalled();
    });

    it('in a complete class', async () => {
      state.selectedClass = { id: 'c1', status: 'complete' };
      render(invite(newProject()));
      await flush();
      expect(api.getScrumSummary).not.toHaveBeenCalled();
    });

    it('once this visit has settled the team', async () => {
      const project = newProject();
      settleMoveInInvite(project);
      render(invite(project));
      await flush();
      expect(api.getScrumSummary).not.toHaveBeenCalled();
    });
  });
});
