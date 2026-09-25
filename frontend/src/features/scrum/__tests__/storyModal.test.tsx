import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoryModal from '../components/StoryModal';
import { buildMemberMap } from '../scrumTypes';
import { makeMembers, makeStory } from './fixtures';

vi.mock('@/lib/api', () => ({
  api: { getScrumComments: vi.fn(), createScrumComment: vi.fn() },
}));

const setup = (storyOver = {}, over = {}) => {
  const props = {
    story: makeStory({ key: 'US-1', title: 'Trail search', description_md: 'Find by **name**', ...storyOver }),
    members: buildMemberMap(makeMembers()),
    sprints: [],
    scale: 'fibonacci' as const,
    canWrite: true,
    onClose: vi.fn(),
    onUpdateStory: vi.fn(),
    onOpenTask: vi.fn(),
    onAddTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onMoveTask: vi.fn(),
    onCommentError: vi.fn(),
    onCommentPosted: vi.fn(),
    ...over,
  };
  render(<StoryModal {...props} />);
  return props;
};

describe('StoryModal — editing the story (maintainer 2026-09-25)', () => {
  it('edits the title and description in place', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const title = screen.getByLabelText('Story title');
    expect(title).toHaveFocus();

    await userEvent.clear(title);
    await userEvent.type(title, 'Trail search and filters');
    await userEvent.clear(screen.getByLabelText('Description'));
    await userEvent.type(screen.getByLabelText('Description'), 'Filter by difficulty');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(p.onUpdateStory).toHaveBeenCalledWith({
      title: 'Trail search and filters', description_md: 'Filter by difficulty',
    });
    expect(screen.queryByLabelText('Story title')).toBeNull();   // back to reading
  });

  it('sends only what changed', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByLabelText('Description'), ' and region');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(p.onUpdateStory).toHaveBeenCalledWith({ description_md: 'Find by **name** and region' });
  });

  it('clears a description with an explicit null', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByLabelText('Description'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(p.onUpdateStory).toHaveBeenCalledWith({ description_md: null });
  });

  it('will not save an empty title', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByLabelText('Story title'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves with Ctrl+Enter from the description', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByLabelText('Description'), '!');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(p.onUpdateStory).toHaveBeenCalledWith({ description_md: 'Find by **name**!' });
  });

  it('backs out of an edit on Escape without closing the story', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.keyboard('{Escape}');

    expect(p.onClose).not.toHaveBeenCalled();
    expect(p.onUpdateStory).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Trail search' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(p.onClose).toHaveBeenCalled();
  });

  it('offers to add a description when there is none', async () => {
    setup({ description_md: null });
    await userEvent.click(screen.getByRole('button', { name: 'Add a description' }));
    expect(screen.getByLabelText('Description')).toHaveFocus();
  });

  it('gives staff no way to edit', () => {
    setup({ description_md: null }, { canWrite: false });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a description' })).toBeNull();
  });
});
