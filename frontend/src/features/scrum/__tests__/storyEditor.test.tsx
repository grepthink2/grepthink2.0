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
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'u1');
    await userEvent.selectOptions(screen.getByLabelText('Sprint'), 'sp1');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));

    // Exact: no time estimate goes with a story.
    expect(p.onCreate).toHaveBeenCalledWith({
      title: 'Offline maps',
      description_md: 'Download **before** the trailhead',
      points: 8,
      assignee_id: 'u1',
      sprint_id: 'sp1',
    });
  });

  it("asks for no time estimate: a story's hours are the sum of its tasks'", () => {
    render(<StoryEditorModal {...props()} />);
    expect(screen.queryByLabelText('Time estimate')).toBeNull();
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

  it('sends the acceptance criteria, trimmed and without the blank rows', async () => {
    const p = props();
    render(<StoryEditorModal {...p} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Trail search');
    const add = screen.getByRole('button', { name: 'Add criterion' });
    await userEvent.click(add);
    await userEvent.type(screen.getByRole('textbox', { name: 'Criterion 1' }), '  Finds a trail by name  ');
    await userEvent.click(add);                                   // left blank
    await userEvent.click(add);
    await userEvent.type(screen.getByRole('textbox', { name: 'Criterion 3' }), 'Says so when none match');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));

    expect(p.onCreate).toHaveBeenCalledWith({
      title: 'Trail search',
      sprint_id: 'sp2',
      acceptance_criteria: ['Finds a trail by name', 'Says so when none match'],
    });
  });

  it('sends no criteria when every row was left blank', async () => {
    const p = props();
    render(<StoryEditorModal {...p} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Trail search');
    await userEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));

    expect(p.onCreate).toHaveBeenCalledWith({ title: 'Trail search', sprint_id: 'sp2' });
  });

  it('will not create the story while a criterion is past 300 characters', async () => {
    const p = props();
    render(<StoryEditorModal {...p} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Trail search');
    await userEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    await userEvent.click(screen.getByRole('textbox', { name: 'Criterion 1' }));
    await userEvent.paste('x'.repeat(301));
    const create = screen.getByRole('button', { name: 'Create story' });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Title'), '{Enter}');
    expect(p.onCreate).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox', { name: 'Criterion 1' }), '{Backspace}');
    expect(create).toBeEnabled();
  });

  it('puts the criteria above the description, which asks for notes', () => {
    render(<StoryEditorModal {...props()} />);
    const criteria = screen.getByRole('group', { name: 'Acceptance criteria' });
    const description = screen.getByLabelText('Description');
    expect(criteria.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(description).toHaveAttribute('placeholder', 'Notes, links, anything the team needs…');
  });

  it('blocks a double submit while saving', async () => {
    const p = props();
    render(<StoryEditorModal {...p} saving />);
    await userEvent.type(screen.getByLabelText('Title'), 'Trail search');

    // Busy, not disabled: the button keeps its colour and its focus; the guard ignores clicks.
    const busy = screen.getByRole('button', { name: 'Creating…' });
    expect(busy).toBeEnabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(busy);
    expect(p.onCreate).not.toHaveBeenCalled();
  });
});
