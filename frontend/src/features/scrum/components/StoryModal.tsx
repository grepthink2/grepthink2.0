import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import MarkdownText from '@components/Markdown/MarkdownText';
import type {
  ApiScrumSprint, ApiScrumStory, ApiScrumTask,
} from '@/lib/api';
import { BOARD_COLUMNS } from '../config/scrumTags';
import type { BoardStatus, EstimateScale } from '../config/scrumTags';
import type { MemberMap } from '../scrumTypes';
import { personOf, UNKNOWN_PERSON } from '../scrumTypes';
import { assignedTaskPoints, storyRollup } from '../utils/rollups';
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
  /** Scroll to and highlight this task (set when opened from a card). */
  focusTaskId?: string | null;
  canWrite?: boolean;
  onClose: () => void;
  onUpdateStory: (body: { points?: number; sprint_id?: string | null; archived?: boolean }) => void;
  /** Open the task editor for this task. The page swaps modals rather than
   *  stacking them — story and task detail are never on screen together. */
  onOpenTask: (task: ApiScrumTask) => void;
  /** Open the task editor in create mode for this story. */
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTask: (taskId: string, to: BoardStatus) => void;
  onCommentError: (message: string) => void;
  /** Refresh the board so comment counts on cards stay accurate. */
  onCommentPosted: () => void;
}

/**
 * Story detail — description, meta, and the child tasks.
 *
 * The per-task status select here is the board's keyboard/assistive path:
 * HTML5 drag and drop is mouse-only, so every move must also be reachable
 * from this list.
 */
export default function StoryModal({
  story, members, sprints, scale, focusTaskId, canWrite = true,
  onClose, onUpdateStory, onOpenTask, onAddTask, onDeleteTask, onMoveTask,
  onCommentError, onCommentPosted,
}: StoryModalProps) {
  const focusedTask = story.tasks.find((t) => t.id === focusTaskId) ?? null;
  const [confirmDelete, setConfirmDelete] = useState<ApiScrumTask | null>(null);
  const focusRef = useRef<HTMLLIElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const { tasksDone, tasksTotal, pointsDone } = storyRollup(story);
  const assigned = assignedTaskPoints(story);
  const reporter = personOf(members, story.reporter_id, UNKNOWN_PERSON);
  const assignee = personOf(members, story.assignee_id);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  // Opening from a card should land on that task, not the top of the list.
  useEffect(() => {
    if (focusTaskId && focusRef.current) {
      // Optional-called: jsdom (and non-DOM renderers) omit scrollIntoView.
      focusRef.current.scrollIntoView?.({ block: 'nearest' });
    } else {
      closeRef.current?.focus();
    }
  }, [focusTaskId]);

  return (
    <div className="story-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="story-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} className="story-modal__close" onClick={onClose} aria-label="Close story">
          <X size={20} />
        </button>

        <header className="story-modal__head">
          <span className="story-modal__key">{story.key}</span>
          <h2 className="story-modal__title" id="story-modal-title">{story.title}</h2>
        </header>

        <div className="story-modal__meta">
          {story.points != null && <PointsChip points={story.points} />}
          {story.time_estimate && <EstimateChip estimate={story.time_estimate} />}
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

        {story.description_md && (
          <div className="story-modal__description">
            <MarkdownText>{story.description_md}</MarkdownText>
          </div>
        )}

        <section className="story-modal__tasks">
          <h3 className="story-modal__section-title">Tasks</h3>
          {story.tasks.length === 0 && (
            <p className="story-modal__empty">No tasks yet.</p>
          )}
          <ul className="story-modal__task-list">
            {story.tasks.map((t) => (
              <li
                key={t.id}
                ref={t.id === focusTaskId ? focusRef : undefined}
                className={`story-modal__task${t.id === focusTaskId ? ' story-modal__task--focused' : ''}`}
              >
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
                <label className="story-modal__task-status">
                  <span className="sr-only">Status of {t.key}</span>
                  <select
                    value={t.status}
                    disabled={!canWrite}
                    onChange={(e) => onMoveTask(t.id, e.target.value as BoardStatus)}
                  >
                    {BOARD_COLUMNS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </label>
                {canWrite && (
                  <button
                    type="button"
                    className="story-modal__task-delete"
                    aria-label={`Delete ${t.key}`}
                    onClick={() => setConfirmDelete(t)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canWrite && (
            <button
              type="button"
              className="story-modal__add-task"
              onClick={onAddTask}
            >
              <Plus size={14} aria-hidden="true" /> Add task
            </button>
          )}
        </section>

        {focusedTask && (
          <section className="story-modal__comments">
            <h3 className="story-modal__section-title">Comments on {focusedTask.key}</h3>
            <CommentThread
              taskId={focusedTask.id}
              taskKey={focusedTask.key}
              members={members}
              onError={onCommentError}
              onPosted={onCommentPosted}
            />
          </section>
        )}

        {canWrite && (
          <footer className="story-modal__foot">
            <label className="story-modal__sprint">
              <span className="story-modal__label">Sprint</span>
              <select
                value={story.sprint_id ?? ''}
                onChange={(e) => onUpdateStory({ sprint_id: e.target.value || null })}
              >
                <option value="">Backlog</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="story-modal__archive"
              onClick={() => onUpdateStory({ archived: !story.archived_at })}
            >
              {story.archived_at ? 'Restore story' : 'Archive story'}
            </button>
          </footer>
        )}

        {confirmDelete && (
          <div className="story-modal__confirm" role="alertdialog" aria-label="Confirm delete">
            <p>Delete {confirmDelete.key}? This also removes its comments and move history.</p>
            <div className="story-modal__confirm-actions">
              <button type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                type="button"
                className="story-modal__confirm-delete"
                onClick={() => { onDeleteTask(confirmDelete.id); setConfirmDelete(null); }}
              >
                Delete task
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
