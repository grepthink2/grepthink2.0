import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoryEditorModal from '../components/StoryEditorModal';
import { makeMembers } from './fixtures';

const sprints = [
  { id: 'sp1', name: 'Sprint 1', starts_at: '2026-08-10', ends_at: '2026-08-23', status: 'completed' as const },
  { id: 'sp2', name: 'Sprint 2', starts_at: '2026-08-24', ends_at: '2026-09-06', status: 'active' as const },
];

const props = () => ({
  members: makeMembers(),
  sprints,
  currentSprintId: 'sp2',
  scale: 'fibonacci' as const,
  onClose: vi.fn(),
  onCreate: vi.fn(),
});

describe('StoryEditorModal', () => {
  it('requires a title before it will submit', async () => {
    const p = props();
    render(<StoryEditorModal {...p} />);
    const submit = screen.getByRole('button', { name: 'Create story' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Title'), '   ');
    expect(submit).toBeDisabled();          // whitespace is not a title

    await userEvent.type(screen.getByLabelText('Title'), 'Trail search');
    expect(submit).toBeEnabled();
  });

  it('sends only the fields that were filled in', async () => {
    const p = props();
    render(<StoryEditorModal {...p} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Trail search');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));

    // Optional fields are omitted rather than sent empty; sprint defaults to the board's.
    expect(p.onCreate).toHaveBeenCalledWith({ title: 'Trail search', sprint_id: 'sp2' });
  });

  it('sends every field when the form is filled', async () => {
    const p = props();
    render(<StoryEditorModal {...p} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Offline maps');
    await userEvent.type(screen.getByLabelText('Description'), 'Download **before** the trailhead');
    await userEvent.click(screen.getByRole('radio', { name: '8' }));
    await userEvent.type(screen.getByLabelText('Time estimate'), '3d');
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'u1');
    await userEvent.selectOptions(screen.getByLabelText('Sprint'), 'sp1');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));

    expect(p.onCreate).toHaveBeenCalledWith({
      title: 'Offline maps',
      description_md: 'Download **before** the trailhead',
      points: 8,
      time_estimate: '3d',
      assignee_id: 'u1',
      sprint_id: 'sp1',
    });
  });

  it('offers the active scale values and a Backlog option', () => {
    render(<StoryEditorModal {...props()} />);
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['1', '2', '3', '5', '8', '13']);
    expect(screen.getByRole('option', { name: 'Backlog' })).toBeInTheDocument();
  });

  it('omits the sprint when Backlog is chosen (server reads that as backlog)', async () => {
    const p = props();
    render(<StoryEditorModal {...p} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Someday idea');
    await userEvent.selectOptions(screen.getByLabelText('Sprint'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));

    expect(p.onCreate).toHaveBeenCalledWith({ title: 'Someday idea' });
  });

  it('defaults to Backlog when the board has no sprint', () => {
    render(<StoryEditorModal {...props()} currentSprintId={null} />);
    expect(screen.getByLabelText('Sprint')).toHaveValue('');
  });

  it('closes on Escape and on Cancel', async () => {
    const p = props();
    render(<StoryEditorModal {...p} />);
    await userEvent.keyboard('{Escape}');
    expect(p.onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it('blocks a double submit while saving', async () => {
    const p = props();
    render(<StoryEditorModal {...p} saving />);
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });
});
