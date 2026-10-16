import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import MarkdownText from '@components/Markdown/MarkdownText';
import type {
  ApiScrumSprint, ApiScrumStory, ApiScrumTask, ApiUpdateStoryBody,
} from '@/lib/api';
import { statusLabel } from '../config/scrumTags';
import type { EstimateScale } from '../config/scrumTags';
import type { MemberMap } from '../scrumTypes';
import { personOf, UNKNOWN_PERSON } from '../scrumTypes';
import { isBacklogStory } from '../utils/backlog';
import { assignedTaskPoints, remainingStoryPoints, storyHours, storyRollup } from '../utils/rollups';
import { EstimateChip, PointsChip, UserPair } from './Chips';
import CommentThread from './CommentThread';
import { PointPicker } from './ScalePicker';
import TagBadge from './TagBadge';
import './StoryModal.scss';

export interface StoryModalProps {
  story: ApiScrumStory;
  members: MemberMap;
  sprints: ApiScrumSprint[];
  scale: EstimateScale;
  canWrite?: boolean;
  onClose: () => void;
  onUpdateStory: (body: ApiUpdateStoryBody) => void;
  /** Open the task editor for this task. The page swaps modals rather than
   *  stacking them — story and task detail are never on screen together. */
  onOpenTask: (task: ApiScrumTask) => void;
  /** Open the task editor in create mode for this story. */
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  /** Delete this story and its tasks; offered for a backlog story only. */
  onDeleteStory: () => void;
  /** The story delete is in flight: its confirm button says so and ignores clicks. */
  deleting?: boolean;
  onCommentError: (message: string) => void;
  /** Refresh the board so comment counts on cards stay accurate. */
  onCommentPosted: () => void;
}

/** What the sticky confirm is asking about, if anything. */
type Confirm = { kind: 'task'; task: ApiScrumTask } | { kind: 'story' } | null;

/**
 * Story detail — description, meta, the child tasks and the story's comment thread.
 *
 * Task rows show where each task is but do not move it: that happens on the board,
 * by drag and drop, or from the task's own editor, whose Status select is the
 * keyboard/assistive path (HTML5 drag and drop is mouse-only).
 */
export default function StoryModal({
  story, members, sprints, scale, canWrite = true,
  onClose, onUpdateStory, onOpenTask, onAddTask, onDeleteTask, onDeleteStory, deleting = false,
  onCommentError, onCommentPosted,
}: StoryModalProps) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  // In-place editing of the story's text (the create-only StoryEditorModal has
  // always pointed here for edits; until 2026-09-25 nothing was wired).
  const [editing, setEditing] = useState<null | 'title' | 'description'>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  const { tasksDone, tasksTotal, pointsDone } = storyRollup(story);
  const hours = storyHours(story);
  const assigned = assignedTaskPoints(story);
  const reporter = personOf(members, story.reporter_id, UNKNOWN_PERSON);
  const assignee = personOf(members, story.assignee_id);
  const backlog = isBacklogStory(story);
  // The story's points are a budget (maintainer 2026-08-29): once its tasks claim them all,
  // no task can be added. A story without points is never capped (null).
  const capped = remainingStoryPoints(story) === 0;
  const taskCount = story.tasks.length;
  const storyQuestion = taskCount === 0
    ? `Delete ${story.key}? Its comments go too. This can't be undone.`
    : `Delete ${story.key} and its ${taskCount} task${taskCount === 1 ? '' : 's'}? `
      + 'Their comments and history go too. This can\'t be undone.';

  // Esc backs out of an edit first; only a second Esc closes the story.
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) setEditing(null);
      else onClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose, editing]);

  /** `focus` picks which field takes the cursor: the one the reader asked to change. */
  const startEdit = (focus: 'title' | 'description') => {
    setDraftTitle(story.title);
    setDraftDescription(story.description_md ?? '');
    setEditing(focus);
  };

  const saveEdit = () => {
    const title = draftTitle.trim();
    if (!title) return;
    const description = draftDescription.trim();
    // Only what changed: an untouched title shouldn't re-save, and a cleared
    // description goes as null, which the API treats as "clear".
    const body: ApiUpdateStoryBody = {};
    if (title !== story.title) body.title = title;
    if (description !== (story.description_md ?? '')) body.description_md = description || null;
    if (Object.keys(body).length) onUpdateStory(body);
    setEditing(null);
  };

  // Focus starts on the close button, inside the dialog.
  useEffect(() => { closeRef.current?.focus(); }, []);

  return (
    <div className="story-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="story-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-modal-key story-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} className="story-modal__close" onClick={onClose} aria-label="Close story">
          <X size={20} />
        </button>

        <header className="story-modal__head">
          <div className="story-modal__head-row">
            <span className="story-modal__key" id="story-modal-key">{story.key}</span>
            {canWrite && !editing && (
              <button type="button" className="story-modal__edit" onClick={() => startEdit('title')}>
                <Pencil size={12} aria-hidden="true" />
                Edit
              </button>
            )}
          </div>
          {editing ? (
            <input
              className="story-modal__title-input"
              aria-label="Story title"
              value={draftTitle}
              maxLength={200}
              autoFocus={editing === 'title'}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
            />
          ) : (
            <h2 className="story-modal__title" id="story-modal-title">{story.title}</h2>
          )}
        </header>

        <div className="story-modal__meta">
          {story.points != null && <PointsChip points={story.points} />}
          {hours != null && <EstimateChip estimate={`${hours}h`} />}
          <UserPair reporter={reporter} assignee={assignee} size={24} />
          <span className="story-modal__rollup">
            {tasksDone}/{tasksTotal} tasks{story.points ? ` · ${pointsDone}/${story.points} pts` : ''}
          </span>
        </div>

        {canWrite && (
          <div className="story-modal__points">
            <span className="story-modal__label">Points</span>
            <PointPicker
              scale={scale}
              value={story.points}
              onChange={(points) => onUpdateStory({ points })}
              disabledBelow={assigned || null}
              disabledReason={`${assigned} pts are committed to this story's tasks — delete a task to go lower`}
            />
          </div>
        )}

        {editing ? (
          <div className="story-modal__edit-form">
            <label className="story-modal__label" htmlFor="story-modal-description">Description</label>
            <textarea
              id="story-modal-description"
              aria-describedby="story-modal-description-hint"
              rows={6}
              value={draftDescription}
              maxLength={20000}
              placeholder="What should a user be able to do, and how will the team know it's done?"
              autoFocus={editing === 'description'}
              onChange={(e) => setDraftDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(); }}
            />
            <div className="story-modal__edit-foot">
              <span className="story-modal__hint" id="story-modal-description-hint">
                **bold** · `code` · - lists · ⌘/Ctrl+Enter to save
              </span>
              <button type="button" className="story-modal__edit-cancel" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="story-modal__edit-save"
                onClick={saveEdit}
                disabled={!draftTitle.trim()}
              >
                Save
              </button>
            </div>
          </div>
        ) : story.description_md ? (
          <div className="story-modal__description">
            <MarkdownText>{story.description_md}</MarkdownText>
          </div>
        ) : canWrite ? (
          <button type="button" className="story-modal__add-description" onClick={() => startEdit('description')}>
            <Plus size={12} aria-hidden="true" />
            Add a description
          </button>
        ) : null}

        <section className="story-modal__tasks">
          <h3 className="story-modal__section-title">Tasks</h3>
          {story.tasks.length === 0 && (
            <p className="story-modal__empty">No tasks yet.</p>
          )}
          <ul className="story-modal__task-list">
            {story.tasks.map((t) => (
              <li key={t.id} className="story-modal__task">
                <span className="story-modal__task-key">{t.key}</span>
                <button
                  type="button"
                  className="story-modal__task-title"
                  onClick={() => onOpenTask(t)}
                >
                  {t.title}
                </button>
                <span className="story-modal__task-tags">
                  {t.tags.slice(0, 2).map((tag) => <TagBadge key={tag} tag={tag} />)}
                </span>
                <span className="story-modal__task-status">{statusLabel(t.status)}</span>
                {canWrite && (
                  <button
                    type="button"
                    className="story-modal__task-delete"
                    aria-label={`Delete ${t.key}`}
                    onClick={() => setConfirm({ kind: 'task', task: t })}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canWrite && (
            <>
              <button
                type="button"
                className="story-modal__add-task"
                onClick={onAddTask}
                disabled={capped}
                aria-describedby={capped ? 'story-modal-cap' : undefined}
              >
                <Plus size={14} aria-hidden="true" /> Add task
              </button>
              {capped && (
                <p className="story-modal__cap" id="story-modal-cap">
                  {`All ${story.points} points are assigned. Raise the story's points to add a task.`}
                </p>
              )}
            </>
          )}
        </section>

        {/* The story's own thread; staff comment too (D2). A task's thread is in its editor. */}
        <section className="story-modal__comments">
          <h3 className="story-modal__section-title">Comments</h3>
          <CommentThread
            key={story.id}
            parent={{ kind: 'stories', id: story.id, key: story.key }}
            members={members}
            onError={onCommentError}
            onPosted={onCommentPosted}
          />
        </section>

        {canWrite && (
          <footer className="story-modal__foot">
            <label className="story-modal__sprint">
              <span className="story-modal__label">Sprint</span>
              {/* A backlog story (a legacy archived one too, whatever sprint it still names)
                  shows a placeholder, never "Backlog": picking any sprint moves it there. */}
              <select
                value={backlog ? '' : story.sprint_id ?? ''}
                onChange={(e) => onUpdateStory({ sprint_id: e.target.value || null })}
              >
                {backlog
                  ? <option value="" disabled>Move to a sprint…</option>
                  : <option value="">Backlog</option>}
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.status === 'completed' ? `${s.name} (completed)` : s.name}
                  </option>
                ))}
              </select>
            </label>
            {/* Only from the backlog: a sprint's scope never drops by deletion. */}
            {backlog && (
              <button
                type="button"
                className="story-modal__delete"
                onClick={() => setConfirm({ kind: 'story' })}
              >
                Delete story
              </button>
            )}
          </footer>
        )}

        {/* Keyed by its subject, so Cancel takes focus whenever the question changes. */}
        {confirm && (
          <div
            key={confirm.kind === 'task' ? confirm.task.id : 'story'}
            className="story-modal__confirm"
            role="alertdialog"
            aria-label="Confirm delete"
          >
            <p>
              {confirm.kind === 'task'
                ? `Delete ${confirm.task.key}? This also removes its comments and move history.`
                : storyQuestion}
            </p>
            <div className="story-modal__confirm-actions">
              {/* An alertdialog takes focus, and Cancel is the safe place for it. */}
              <button type="button" autoFocus onClick={() => setConfirm(null)}>Cancel</button>
              {confirm.kind === 'task' ? (
                <button
                  type="button"
                  className="story-modal__confirm-delete"
                  onClick={() => { onDeleteTask(confirm.task.id); setConfirm(null); }}
                >
                  Delete task
                </button>
              ) : (
                // Busy, not disabled: it keeps its colour and focus, and a second click is ignored.
                <button
                  type="button"
                  className="story-modal__confirm-delete"
                  aria-busy={deleting}
                  onClick={() => { if (!deleting) onDeleteStory(); }}
                >
                  {deleting && <Loader2 className="story-modal__spinner" size={14} aria-hidden="true" />}
                  {deleting ? 'Deleting…' : 'Delete story'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
