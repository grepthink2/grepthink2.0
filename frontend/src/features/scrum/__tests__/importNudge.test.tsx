import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOVE_IN_PROMPT } from '@features/connector/prompts';
import ImportNudge from '../components/ImportNudge';

const TITLE = 'Already running sprints somewhere else?';

/** The component remembers a dismissal for the page's life, so each test takes its own project. */
let projects = 0;
const newProject = () => `p${++projects}`;

const blockStorage = (method: 'getItem' | 'setItem') =>
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error('blocked');
  });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('ImportNudge', () => {
  it('stores a dismissal for this project, and only this one', async () => {
    const user = userEvent.setup();
    const [project, other] = [newProject(), newProject()];
    const first = render(<ImportNudge projectId={project} onConnect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    expect(localStorage.getItem(`gt.scrum.importNudgeDismissed.${project}`)).not.toBeNull();
    first.unmount();

    render(<ImportNudge projectId={other} onConnect={vi.fn()} />);
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it('stays hidden after a reload, by what storage holds', () => {
    const project = newProject();
    localStorage.setItem(`gt.scrum.importNudgeDismissed.${project}`, '1');

    render(<ImportNudge projectId={project} onConnect={vi.fn()} />);

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('shows when storage cannot be read', () => {
    blockStorage('getItem');
    render(<ImportNudge projectId={newProject()} onConnect={vi.fn()} />);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it('stays dismissed through a board reload when storage refuses the dismissal', async () => {
    const user = userEvent.setup();
    const project = newProject();
    blockStorage('setItem');
    const first = render(<ImportNudge projectId={project} onConnect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    first.unmount();

    render(<ImportNudge projectId={project} onConnect={vi.fn()} />);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('copies the prompt', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ImportNudge projectId={newProject()} onConnect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Copy the prompt' }));

    expect(writeText).toHaveBeenCalledWith(MOVE_IN_PROMPT);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the prompt to copy by hand when the clipboard refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<ImportNudge projectId={newProject()} onConnect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Copy the prompt' }));

    expect(await screen.findByRole('textbox', { name: 'Copy this prompt into your assistant' })).toHaveValue(MOVE_IN_PROMPT);
  });

  it('asks for what the import needs', () => {
    expect(MOVE_IN_PROMPT).toMatch(/sprints, stories and tasks/);
    expect(MOVE_IN_PROMPT).toMatch(/status/);
    expect(MOVE_IN_PROMPT).toMatch(/estimate in points or hours/);
    expect(MOVE_IN_PROMPT).toMatch(/the day it was done/);
    expect(MOVE_IN_PROMPT).toMatch(/a card with no tasks one story with one task/);
    expect(MOVE_IN_PROMPT).toMatch(/add nothing until I say yes/);
  });
});
