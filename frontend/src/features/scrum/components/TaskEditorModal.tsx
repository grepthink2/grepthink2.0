import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type {
  ApiCreateTaskBody, ApiScrumMember, ApiScrumStory, ApiScrumTask, ApiUpdateTaskBody,
} from '@/lib/api';
import { TASK_TAGS } from '../config/scrumTags';
import type { EstimateScale } from '../config/scrumTags';
import { assignedTaskPoints } from '../utils/rollups';
import { PointPicker } from './ScalePicker';
import TagBadge from './TagBadge';
import './TaskEditorModal.scss';

interface Props {
  /** The parent story — this editor is only reachable from its detail. */
  story: ApiScrumStory;
  /** Present = edit that task; absent = create a new one in the story. */
  task?: ApiScrumTask | null;
  members: ApiScrumMember[];
  scale: EstimateScale;
  saving?: boolean;
  /** Dismisses the editor entirely, back to the board. */
  onClose: () => void;
  /** Returns to the parent story's detail. Omit and the back arrow closes. */
  onBack?: () => void;
  onCreate?: (body: ApiCreateTaskBody) => void;
  onSave?: (body: ApiUpdateTaskBody) => void;
}

/**
 * Create or edit a task inside a story. Always rendered by ScrumBoardPage as
 * the *only* modal on screen — opening it closes the story detail rather than
 * stacking over it (maintainer 2026-09-10) — and every task still carries its
 * parent story, reachable through the back arrow.
 *
 * Points are capped at what the parent story has left (maintainer 2026-08-29):
 * the story estimate is a budget in both directions — a story cannot drop below
 * what its tasks claim, and a task cannot claim more than the story has.
 */
export default function TaskEditorModal({
  story, task = null, members, scale, saving = false, onClose, onBack, onCreate, onSave,
}: Props) {
  const back = onBack ?? onClose;
  const editing = task != null;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description_md ?? '');
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [points, setPoints] = useState<number | undefined>(task?.points ?? undefined);
  const [estimate, setEstimate] = useState(task?.time_estimate ?? '');
  const [assignee, setAssignee] = useState(task?.assignee_id ?? '');
  const titleRef = useRef<HTMLInputElement>(null);

  // Budget left for this task: siblings count against the story, but the task's
  // own current points are its to keep when re-pointing.
  const siblingPoints = assignedTaskPoints(story) - (task?.points ?? 0);
  const ceiling = story.points == null ? null : Math.max(0, story.points - siblingPoints);

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
    if (editing) {
      // Edits send the full field set: clearing a description or unassigning
      // must persist, which an omit-when-empty body could never express.
      onSave?.({
        title: trimmed,
        description_md: description.trim() || undefined,
        tags,
        points,
        time_estimate: estimate.trim() || undefined,
        assignee_id: assignee || undefined,
      });
      return;
    }
    onCreate?.({
      title: trimmed,
      ...(description.trim() ? { description_md: description.trim() } : {}),
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

        {/* Back to the story this task belongs to — also the parent reference.
            The page swaps the two modals, so this is navigation, not a close. */}
        {/* Explicit label: the key and title spans are adjacent in the DOM, so the
            computed name would otherwise run them together ("US-1Login flow"). */}
        <button
          type="button"
          className="task-editor__back"
          aria-label={`Back to ${story.key} ${story.title}`}
          onClick={back}
        >
          <ArrowLeft size={13} aria-hidden="true" />
          <span className="task-editor__back-key">{story.key}</span>
          <span className="task-editor__back-title">{story.title}</span>
        </button>

        <h2 className="task-editor__title" id="task-editor-title">
          {editing ? `Edit ${task.key}` : `New task in ${story.key}`}
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
          <label className="task-editor__label" htmlFor="task-editor-description">Description</label>
          <textarea
            id="task-editor-description"
            aria-describedby="task-editor-description-hint"
            rows={3}
            value={description}
            placeholder="What does done look like?"
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className="task-editor__hint" id="task-editor-description-hint">
            **bold** · `code` · - lists
          </span>
        </div>

        <div className="task-editor__field">
          <span className="task-editor__label" id="task-editor-tags-label">Labels</span>
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
          <PointPicker
            scale={scale}
            value={points}
            onChange={setPoints}
            disabledAbove={ceiling}
            disabledReason={ceiling != null
              ? `${story.key} has ${ceiling} pts left — raise the story's points to go higher`
              : undefined}
          />
          {ceiling != null && (
            <span className="task-editor__hint">
              {ceiling > 0
                ? `${ceiling} of ${story.points} pts available in ${story.key}`
                : `${story.key}'s ${story.points} pts are fully assigned — raise the story to add more`}
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
            {saving ? 'Saving…' : editing ? 'Save task' : 'Add task'}
          </button>
        </footer>
      </div>
    </div>
  );
}
