import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ApiCreateTaskBody, ApiScrumMember, ApiScrumStory } from '@/lib/api';
import { ESTIMATE_SCALES, TASK_TAGS } from '../config/scrumTags';
import type { EstimateScale } from '../config/scrumTags';
import { remainingStoryPoints } from '../utils/rollups';
import TagBadge from './TagBadge';
import './TaskEditorModal.scss';

interface Props {
  /** The parent story — this editor is only reachable from its detail (F14). */
  story: ApiScrumStory;
  members: ApiScrumMember[];
  scale: EstimateScale;
  saving?: boolean;
  onClose: () => void;
  onCreate: (body: ApiCreateTaskBody) => void;
}

/**
 * Create a task inside a story. Deliberately has no route or board-level entry
 * point: a task without a parent story has nowhere to live, so the only way in
 * is the story detail's "Add task".
 *
 * Points are *suggested* against what the story has left unassigned rather than
 * capped — story estimates are a forecast, and a team that needs 5 more points
 * of work than they guessed should be able to say so.
 */
export default function TaskEditorModal({
  story, members, scale, saving = false, onClose, onCreate,
}: Props) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [points, setPoints] = useState<number | undefined>();
  const [estimate, setEstimate] = useState('');
  const [assignee, setAssignee] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  const remaining = remainingStoryPoints(story);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    titleRef.current?.focus();
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    onCreate({
      title: trimmed,
      ...(tags.length ? { tags } : {}),
      ...(points != null ? { points } : {}),
      ...(estimate.trim() ? { time_estimate: estimate.trim() } : {}),
      ...(assignee ? { assignee_id: assignee } : {}),
    });
  };

  return (
    <div className="task-editor-backdrop" onClick={onClose} role="presentation">
      <div
        className="task-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="task-editor__close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <h2 className="task-editor__title" id="task-editor-title">
          New task in <span className="task-editor__story-key">{story.key}</span>
        </h2>

        <div className="task-editor__field">
          <label className="task-editor__label" htmlFor="task-editor-title-input">Title</label>
          <input
            ref={titleRef}
            id="task-editor-title-input"
            type="text"
            value={title}
            maxLength={200}
            placeholder="What needs doing?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </div>

        <div className="task-editor__field">
          <span className="task-editor__label" id="task-editor-tags-label">Tags</span>
          <div className="task-editor__tags" role="group" aria-labelledby="task-editor-tags-label">
            {TASK_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  className={`task-editor__tag${on ? ' task-editor__tag--on' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  <TagBadge tag={tag} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="task-editor__field">
          <span className="task-editor__label" id="task-editor-points-label">Points</span>
          <div className="task-editor__points" role="radiogroup" aria-labelledby="task-editor-points-label">
            {ESTIMATE_SCALES[scale].map((v) => {
              // Over the story's remaining budget: still offered, just quieter.
              const over = remaining != null && v > remaining;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={points === v}
                  className={[
                    'task-editor__point',
                    points === v ? 'task-editor__point--on' : '',
                    over ? 'task-editor__point--over' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setPoints(v)}
                >
                  {v}
                </button>
              );
            })}
          </div>
          {remaining != null && (
            <span className="task-editor__hint">
              {remaining > 0
                ? `${remaining} of ${story.points} pts still unassigned in ${story.key}`
                : `${story.key}'s ${story.points} pts are fully assigned — anything more grows the story`}
            </span>
          )}
        </div>

        <div className="task-editor__row">
          <div className="task-editor__field">
            <label className="task-editor__label" htmlFor="task-editor-estimate">Time estimate</label>
            <input
              id="task-editor-estimate"
              type="text"
              value={estimate}
              maxLength={20}
              placeholder="4h"
              onChange={(e) => setEstimate(e.target.value)}
            />
          </div>

          <div className="task-editor__field">
            <label className="task-editor__label" htmlFor="task-editor-assignee">Assignee</label>
            <select
              id="task-editor-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <footer className="task-editor__foot">
          <button type="button" className="task-editor__cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="task-editor__submit"
            onClick={submit}
            disabled={!title.trim() || saving}
          >
            {saving ? 'Adding…' : 'Add task'}
          </button>
        </footer>
      </div>
    </div>
  );
}
