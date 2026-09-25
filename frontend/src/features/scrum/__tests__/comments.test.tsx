import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentThread from '../components/CommentThread';
import StoryModal from '../components/StoryModal';
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
  render(<CommentThread taskId="t1" taskKey="T-1" members={members} onError={onError} onPosted={onPosted} />);

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

  it('says so when a task has no comments', async () => {
    renderThread();
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
  });

  it('posts a comment, appends it, and clears the composer', async () => {
    vi.mocked(api.createScrumComment).mockResolvedValue({ message: 'ok', comment: comment({ body_md: 'Nice work' }) });
    renderThread();
    await screen.findByText('No comments yet.');

    await userEvent.type(screen.getByLabelText(/comment on T-1/i), 'Nice work');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(api.createScrumComment).toHaveBeenCalledWith('tasks', 't1', 'Nice work');
    expect(await screen.findByText('Nice work')).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText(/comment on T-1/i) as HTMLTextAreaElement).value).toBe(''));
    expect(onPosted).toHaveBeenCalled();
  });

  it('submits on Cmd/Ctrl+Enter', async () => {
    vi.mocked(api.createScrumComment).mockResolvedValue({ message: 'ok', comment: comment() });
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

describe('StoryModal comment thread', () => {
  it('starts each task with an empty composer: a draft does not follow the reader', async () => {
    const story = makeStory({
      tasks: [makeTask({ id: 'a', key: 'T-1' }), makeTask({ id: 'b', key: 'T-2' })],
    });
    const props = {
      story, members, sprints: [], scale: 'fibonacci' as const, canWrite: true,
      onClose: vi.fn(), onUpdateStory: vi.fn(), onOpenTask: vi.fn(), onAddTask: vi.fn(),
      onDeleteTask: vi.fn(), onMoveTask: vi.fn(), onCommentError: vi.fn(), onCommentPosted: vi.fn(),
    };
    const { rerender } = render(<StoryModal {...props} focusTaskId="a" />);
    await screen.findByText('No comments yet.');
    await userEvent.type(screen.getByLabelText(/comment on T-1/i), 'Meant for T-1');

    rerender(<StoryModal {...props} focusTaskId="b" />);
    const box = (await screen.findByLabelText(/comment on T-2/i)) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(api.getScrumComments).toHaveBeenLastCalledWith('tasks', 'b');
  });
});
