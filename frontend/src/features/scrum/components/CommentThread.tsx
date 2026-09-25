import { useEffect, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import MarkdownText from '@components/Markdown/MarkdownText';
import { InitialsAvatar } from '@features/messages/components/InitialsAvatar';
import { api } from '@/lib/api';
import type { ApiScrumComment } from '@/lib/api';
import type { MemberMap } from '../scrumTypes';

/** Mirrors the backend's body_md CHECK — the server is authoritative. */
const MAX_COMMENT = 4000;

interface Props {
  taskId: string;
  taskKey: string;
  members: MemberMap;
  onError: (message: string) => void;
  /** Lets the parent keep the card's comment count in step. */
  onPosted?: () => void;
}

/**
 * Task comment thread (D10: task threads are the v1 surface).
 *
 * The composer is a plain textarea for now; the mentions plan swaps it for
 * MentionTextarea, at which point @mentions light up here and in the
 * markdown bodies without touching this file's data flow.
 */
export default function CommentThread({ taskId, taskKey, members, onError, onPosted }: Props) {
  const [comments, setComments] = useState<ApiScrumComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // StoryModal keys this component by task, so each task starts with an empty
  // thread and no leftover draft; nothing needs resetting here.
  useEffect(() => {
    let alive = true;
    api.getScrumComments('tasks', taskId)
      .then(({ comments: rows }) => { if (alive) setComments(rows); })
      .catch(() => { if (alive) setComments([]); });
    return () => { alive = false; };
  }, [taskId]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { comment } = await api.createScrumComment('tasks', taskId, body);
      setComments((prev) => [...(prev ?? []), comment]);
      setDraft('');
      onPosted?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : `Couldn’t post your comment on ${taskKey}`);
    } finally {
      setSending(false);
    }
  };

  const tooLong = draft.length > MAX_COMMENT;

  return (
    <div className="gt-comments">
      {comments === null && <p className="story-modal__empty">Loading comments…</p>}
      {comments?.length === 0 && <p className="story-modal__empty">No comments yet.</p>}

      {comments?.map((c) => (
        <div key={c.id} className="gt-comments__item">
          <InitialsAvatar
            name={c.author_name}
            imageUrl={members[c.author_id]?.image_url ?? null}
            size={24}
          />
          <div className="gt-comments__body">
            <div className="gt-comments__meta">
              <span className="gt-comments__author">{c.author_name}</span>
              <span className="gt-comments__time">
                {formatDistanceToNowStrict(new Date(c.created_at))} ago
              </span>
            </div>
            <MarkdownText>{c.body_md}</MarkdownText>
          </div>
        </div>
      ))}

      <div className="gt-comments__composer">
        <textarea
          className="gt-comments__input"
          rows={2}
          value={draft}
          aria-label={`Comment on ${taskKey}`}
          placeholder="Add a comment… (markdown supported)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }}
        />
        <div className="gt-comments__composer-row">
          <span className="gt-comments__hint">
            {tooLong
              ? `${draft.length - MAX_COMMENT} characters over the limit`
              : '**bold** · `code` · ⌘/Ctrl+Enter to post'}
          </span>
          <button
            type="button"
            className="gt-comments__send"
            onClick={submit}
            disabled={!draft.trim() || tooLong || sending}
          >
            {sending ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
