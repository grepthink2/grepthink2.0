import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentThread from '../components/CommentThread';
import TaskEditorModal from '../components/TaskEditorModal';
import { buildMemberMap } from '../scrumTypes';
import { makeMembers, makeStory, makeTask } from './fixtures';

vi.mock('@/lib/api', () => ({
  api: { getScrumComments: vi.fn(), createScrumComment: vi.fn() },
}));
const { api } = await import('@/lib/api');

const members = buildMemberMap(makeMembers());
const onError = vi.fn();
const onPosted = vi.fn();
const renderThread = () =>
  render(
    <CommentThread
      parent={{ kind: 'tasks', id: 't1', key: 'T-1' }}
      members={members}
      onError={onError}
      onPosted={onPosted}
    />,
  );

const comment = (over = {}) => ({
  id: 'c1', author_id: 'u1', author_name: 'Tony Wu',
  body_md: 'Looks good', created_at: new Date().toISOString(), ...over,
});

beforeEach(() => {
  vi.mocked(api.getScrumComments).mockReset().mockResolvedValue({ comments: [] });
  vi.mocked(api.createScrumComment).mockReset();
  onError.mockReset();
  onPosted.mockReset();
});

describe('CommentThread', () => {
  it('shows existing comments with author and markdown body', async () => {
    vi.mocked(api.getScrumComments).mockResolvedValue({
      comments: [comment({ body_md: 'Ship **it**' })],
    });
    renderThread();
    expect(await screen.findByText('Tony Wu')).toBeInTheDocument();
    expect(screen.getByText('it').tagName).toBe('STRONG');   // markdown rendered, not escaped
  });

  it('draws each author’s avatar hidden beside the printed name', async () => {
    vi.mocked(api.getScrumComments).mockResolvedValue({ comments: [comment()] });
    renderThread();
    const author = await screen.findByText('Tony Wu');
    const avatar = author.closest('.gt-comments__item')?.querySelector('.gt-avatar');
    expect(avatar).toHaveTextContent('TW');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveClass('gt-avatar--sm');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('says so when a task has no comments', async () => {
    renderThread();
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
  });

  it('posts a comment, appends it, and clears the composer', async () => {
    vi.mocked(api.createScrumComment).mockResolvedValue(comment({ body_md: 'Nice work' }));
    renderThread();
    await screen.findByText('No comments yet.');

    await userEvent.type(screen.getByLabelText(/comment on T-1/i), 'Nice work');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(api.createScrumComment).toHaveBeenCalledWith('tasks', 't1', 'Nice work');
    expect(await screen.findByText('Nice work')).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText(/comment on T-1/i) as HTMLTextAreaElement).value).toBe(''));
    expect(onPosted).toHaveBeenCalled();
  });

  it('posts to a story when the parent is a story', async () => {
    vi.mocked(api.createScrumComment).mockResolvedValue(comment({ body_md: 'Story note' }));
    render(
      <CommentThread
        parent={{ kind: 'stories', id: 's1', key: 'US-1' }}
        members={members}
        onError={onError}
        onPosted={onPosted}
      />,
    );
    await screen.findByText('No comments yet.');
    expect(api.getScrumComments).toHaveBeenCalledWith('stories', 's1');

    await userEvent.type(screen.getByLabelText('Comment on US-1'), 'Story note');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(api.createScrumComment).toHaveBeenCalledWith('stories', 's1', 'Story note');
  });

  it('submits on Cmd/Ctrl+Enter', async () => {
    vi.mocked(api.createScrumComment).mockResolvedValue(comment());
    renderThread();
    await screen.findByText('No comments yet.');

    const box = screen.getByLabelText(/comment on T-1/i);
    await userEvent.type(box, 'Quick note');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => expect(api.createScrumComment).toHaveBeenCalledWith('tasks', 't1', 'Quick note'));
  });

  it('keeps the send button disabled until there is real content', async () => {
    renderThread();
    await screen.findByText('No comments yet.');
    const send = screen.getByRole('button', { name: 'Comment' });
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/comment on T-1/i), '   ');
    expect(send).toBeDisabled();          // whitespace is not a comment
  });

  it('blocks and explains an over-length comment', async () => {
    renderThread();
    await screen.findByText('No comments yet.');

    await userEvent.click(screen.getByLabelText(/comment on T-1/i));
    await userEvent.paste('x'.repeat(4001));

    expect(screen.getByText(/1 characters over the limit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('keeps Comment enabled while posting, with aria-busy', async () => {
    vi.mocked(api.createScrumComment).mockReturnValue(new Promise(() => {}));   // still in flight
    renderThread();
    await screen.findByText('No comments yet.');

    await userEvent.type(screen.getByLabelText(/comment on T-1/i), 'Nice work');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    const busy = screen.getByRole('button', { name: 'Posting…' });
    expect(busy).toBeEnabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(busy);
    expect(api.createScrumComment).toHaveBeenCalledTimes(1);
  });

  it('reports a failed post without losing the draft', async () => {
    vi.mocked(api.createScrumComment).mockRejectedValue(new Error('offline'));
    renderThread();
    await screen.findByText('No comments yet.');

    await userEvent.type(screen.getByLabelText(/comment on T-1/i), 'Draft text');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('offline'));
    expect((screen.getByLabelText(/comment on T-1/i) as HTMLTextAreaElement).value).toBe('Draft text');
  });
});

describe('TaskEditorModal comment thread', () => {
  it('starts each task with an empty composer: a draft does not follow the reader', async () => {
    const story = makeStory({
      tasks: [makeTask({ id: 'a', key: 'T-1' }), makeTask({ id: 'b', key: 'T-2' })],
    });
    const props = {
      story, members: makeMembers(), scale: 'fibonacci' as const, onClose: vi.fn(), onSave: vi.fn(),
      sprints: [], taskIndex: [], onOpenRef: vi.fn(),
    };
    const { rerender } = render(<TaskEditorModal {...props} task={story.tasks[0]} />);
    await screen.findByText('No comments yet.');
    await userEvent.type(screen.getByLabelText(/comment on T-1/i), 'Meant for T-1');

    rerender(<TaskEditorModal {...props} task={story.tasks[1]} />);
    const box = (await screen.findByLabelText(/comment on T-2/i)) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(api.getScrumComments).toHaveBeenLastCalledWith('tasks', 'b');
  });
});
