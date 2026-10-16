import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Plus, X } from 'lucide-react';
import { Menu, MenuItem } from '@components/Menu/Menu';
import { Popover } from '@components/Popover/Popover';
import type {
  ApiCreateTaskBody, ApiScrumMember, ApiScrumSprint, ApiScrumStory, ApiScrumTask, ApiTaskRef,
  ApiUpdateTaskBody,
} from '@/lib/api';
import { BOARD_COLUMNS, statusLabel, TASK_TAGS } from '../config/scrumTags';
import type { BoardStatus, EstimateScale } from '../config/scrumTags';
import { buildMemberMap } from '../scrumTypes';
import { blockedMessage, isBlocked } from '../utils/dependencies';
import { parseHours } from '../utils/estimateHours';
import { isPrUrl } from '../utils/prLabel';
import { assignedTaskPoints } from '../utils/rollups';
import CommentThread from './CommentThread';
import { PointPicker } from './ScalePicker';
import TagBadge from './TagBadge';
import './TaskEditorModal.scss';

const ignoreCommentError = () => {};

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
  /** Move the task to another column at once (no Save). Present only when the viewer can move
   *  this task: a team member, on a sprint story. Its select is the keyboard path for DnD. */
  onMove?: (to: BoardStatus) => void;
  /** A comment that failed to post (edit mode: an existing task has a thread). */
  onCommentError?: (message: string) => void;
  /** Refresh the board so the card's comment count stays in step. */
  onCommentPosted?: () => void;
  /** The board's sprints, to group the dependency picker ("Sprint 2", "Backlog"). */
  sprints: ApiScrumSprint[];
  /** Every task of the project (board.task_index), for the picker. */
  taskIndex: ApiTaskRef[];
  /** Open another task from its key (a dependency or a dependent); the page switches sprints if needed. */
  onOpenRef: (ref: ApiTaskRef) => void;
  /** Present only when the viewer can edit dependencies (a team member). */
  onAddDependency?: (dependsOnTaskId: string) => void;
  onRemoveDependency?: (dependsOnTaskId: string) => void;
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
 *
 * An existing task's comment thread sits below the form's actions.
 *
 * An existing task also lists what it depends on and what it blocks (spec 2026-10-16), each key a
 * link to that task. Adding or removing a dependency applies at once, not on Save; while the task is
 * blocked, its Status select offers only To do.
 */
export default function TaskEditorModal({
  story, task = null, members, scale, saving = false, onClose, onBack, onCreate, onSave, onMove,
  onCommentError, onCommentPosted, sprints, taskIndex, onOpenRef, onAddDependency, onRemoveDependency,
}: Props) {
  const back = onBack ?? onClose;
  const editing = task != null;
  const memberMap = useMemo(() => buildMemberMap(members), [members]);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description_md ?? '');
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [points, setPoints] = useState<number | undefined>(task?.points ?? undefined);
  // A string, so the box can hold what is being typed; sent as a number.
  const [hours, setHours] = useState(task?.estimate_hours == null ? '' : String(task.estimate_hours));
  // Firefox and Safari give a number box's unreadable text ("4h") as '' — not a cleared box.
  const [hoursBad, setHoursBad] = useState(false);
  const [assignee, setAssignee] = useState(task?.assignee_id ?? '');
  const [prUrl, setPrUrl] = useState(task?.pr_url ?? '');
  const [labelsOpen, setLabelsOpen] = useState(false);
  /** The task picked in the dependency picker, '' for none. */
  const [pick, setPick] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const labelsButtonRef = useRef<HTMLButtonElement>(null);
  const prInvalid = prUrl.trim() !== '' && !isPrUrl(prUrl.trim());
  const { invalid: hoursInvalid } = parseHours(hours, hoursBad);

  // Missing from a backend older than this client: no dependency UI at all then (spec D11).
  const dependsOn = task?.depends_on;
  const blocks = task?.blocks ?? [];
  const blocked = task != null && isBlocked(task);
  // The picker: the project's other tasks by sprint, in the board's sprint order, then the backlog.
  // Never the task itself, what it already depends on, or what depends on it (a direct cycle; a
  // deeper one is refused by the API, whose reason the page shows).
  const taken = new Set([task?.id, ...(dependsOn ?? []).map((d) => d.id), ...blocks.map((d) => d.id)]);
  const offerable = taskIndex.filter((t) => !taken.has(t.id));
  const pickerGroups = [
    ...sprints.map((s) => ({
      id: s.id,
      label: s.status === 'completed' ? `${s.name} (completed)` : s.name,
      tasks: offerable.filter((t) => t.sprint_id === s.id),
    })),
    { id: 'backlog', label: 'Backlog', tasks: offerable.filter((t) => t.sprint_id === null) },
  ].filter((g) => g.tasks.length > 0);

  /** One dependency (or dependent) row: its key opens it; `onRemove` only for a dependency. */
  const refRow = (ref: ApiTaskRef, onRemove?: (id: string) => void) => (
    <li key={ref.id} className="task-editor__dep">
      <button type="button" className="task-editor__dep-key" onClick={() => onOpenRef(ref)}>
        {ref.key}
      </button>
      <span className="task-editor__dep-title">{ref.title}</span>
      <span className={`task-editor__dep-status task-editor__dep-status--${ref.status}`}>
        {statusLabel(ref.status)}
      </span>
      {onRemove && (
        <button
          type="button"
          className="task-editor__dep-remove"
          aria-label={`Remove dependency on ${ref.key}`}
          onClick={() => onRemove(ref.id)}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </li>
  );

  // Budget left for this task: siblings count against the story, but the task's
  // own current points are its to keep when re-pointing.
  const siblingPoints = assignedTaskPoints(story) - (task?.points ?? 0);
  const ceiling = story.points == null ? null : Math.max(0, story.points - siblingPoints);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  // The title takes focus when the editor opens, and only then: the page passes a new onClose
  // on every render, and a board refetch after a comment must not pull focus out of the thread.
  useEffect(() => { titleRef.current?.focus(); }, []);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  // Keyboard users were inside the menu, so hand focus back to its trigger; a click
  // elsewhere then moves focus wherever it landed.
  const closeLabels = useCallback(() => {
    setLabelsOpen(false);
    if (document.activeElement?.closest('.task-editor__labels-menu')) labelsButtonRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || saving || prInvalid || hoursInvalid) return;
    if (editing) {
      // Edits send the full field set with explicit nulls: clearing a description,
      // unassigning or unlinking a PR must persist. `undefined` would be dropped
      // from the JSON body, and the server would keep the old value.
      onSave?.({
        title: trimmed,
        description_md: description.trim() || null,
        tags,
        points,
        estimate_hours: hours.trim() === '' ? null : Number(hours),
        assignee_id: assignee || null,
        pr_url: prUrl.trim() || null,
      });
      return;
    }
    onCreate?.({
      title: trimmed,
      ...(description.trim() ? { description_md: description.trim() } : {}),
      ...(tags.length ? { tags } : {}),
      ...(points != null ? { points } : {}),
      ...(hours.trim() ? { estimate_hours: Number(hours) } : {}),
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

        {/* The board's keyboard/assistive path: HTML5 drag and drop is mouse-only. */}
        {editing && onMove && (
          <div className="task-editor__field task-editor__status">
            <label className="task-editor__label" htmlFor="task-editor-status">Status</label>
            <select
              id="task-editor-status"
              value={task.status}
              aria-describedby="task-editor-status-hint"
              onChange={(e) => onMove(e.target.value as BoardStatus)}
            >
              {/* A blocked task cannot leave To do (spec D1): the same rule as the card and the board. */}
              {BOARD_COLUMNS.map((c) => (
                <option key={c.id} value={c.id} disabled={blocked && c.id !== 'todo'}>{c.label}</option>
              ))}
            </select>
            <span className="task-editor__hint" id="task-editor-status-hint">
              {blocked ? blockedMessage(task) : 'Applies right away.'}
            </span>
          </div>
        )}

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
            {tags.map((tag) => (
              <TagBadge key={tag} tag={tag} onRemove={() => toggleTag(tag)} />
            ))}
            <Popover
              open={labelsOpen}
              onClose={closeLabels}
              padded={false}
              anchor={
                <button
                  ref={labelsButtonRef}
                  type="button"
                  className="task-editor__add-label"
                  aria-haspopup="menu"
                  aria-expanded={labelsOpen}
                  onClick={() => setLabelsOpen((open) => !open)}
                >
                  <Plus size={12} aria-hidden="true" />
                  {tags.length ? 'Label' : 'Add label'}
                </button>
              }
            >
              {/* Stays open while toggling, so several labels take one trip. */}
              <Menu ariaLabel="Labels" autoFocus onClose={closeLabels} className="task-editor__labels-menu">
                {TASK_TAGS.map((tag) => (
                  <MenuItem
                    key={tag}
                    checked={tags.includes(tag)}
                    icon={<Check size={14} aria-hidden="true" />}
                    onSelect={() => toggleTag(tag)}
                  >
                    <TagBadge tag={tag} />
                  </MenuItem>
                ))}
              </Menu>
            </Popover>
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
            <div className="task-editor__hours">
              <input
                id="task-editor-estimate"
                type="number"
                inputMode="numeric"
                min={1}
                max={15}
                step={1}
                value={hours}
                placeholder="4"
                aria-invalid={hoursInvalid || undefined}
                aria-describedby="task-editor-estimate-hint"
                onChange={(e) => setHours(e.target.value)}
                // Every keystroke, not only a value change: deleting unreadable text leaves the value
                // at '' (no onChange), and the box must stop reading as invalid then.
                onInput={(e) => setHoursBad(e.currentTarget.validity.badInput)}
              />
              <span className="task-editor__hours-unit" aria-hidden="true">h</span>
            </div>
            <span className="task-editor__hint" id="task-editor-estimate-hint">
              {hoursInvalid ? 'Enter whole hours, 1 to 15.' : 'Whole hours, up to 15.'}
            </span>
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

        {/* create_task takes no PR, and a PR usually follows the task it closes. */}
        {editing && (
          <div className="task-editor__field">
            <label className="task-editor__label" htmlFor="task-editor-pr">Pull request</label>
            <input
              id="task-editor-pr"
              type="url"
              value={prUrl}
              maxLength={500}
              placeholder="https://github.com/team/repo/pull/42"
              aria-invalid={prInvalid || undefined}
              aria-describedby="task-editor-pr-hint"
              onChange={(e) => setPrUrl(e.target.value)}
            />
            <span className="task-editor__hint" id="task-editor-pr-hint">
              {prInvalid
                ? 'Paste a GitHub pull request link (…/pull/42) or a git.ucsc.edu merge request link.'
                : 'Its open, draft, merged or closed state shows on the card. A private repo needs a token in board settings.'}
            </span>
          </div>
        )}

        {editing && dependsOn && (
          <section className="task-editor__deps" aria-labelledby="task-editor-deps-title">
            <h3 className="task-editor__section-title" id="task-editor-deps-title">Depends on</h3>
            {dependsOn.length === 0
              ? <p className="task-editor__hint">No dependencies.</p>
              : <ul className="task-editor__dep-list">{dependsOn.map((d) => refRow(d, onRemoveDependency))}</ul>}
            {onAddDependency && (
              <div className="task-editor__dep-add">
                <label className="sr-only" htmlFor="task-editor-dep-pick">Add a dependency</label>
                <select id="task-editor-dep-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Add a dependency…</option>
                  {pickerGroups.map((g) => (
                    <optgroup key={g.id} label={g.label}>
                      {g.tasks.map((t) => <option key={t.id} value={t.id}>{`${t.key} · ${t.title}`}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  className="task-editor__dep-add-button"
                  disabled={!pick}
                  onClick={() => { onAddDependency(pick); setPick(''); }}
                >
                  Add
                </button>
              </div>
            )}
            <span className="task-editor__hint">
              Applies right away. A task in To do can’t start until every task it depends on is done.
            </span>
            {blocks.length > 0 && (
              <>
                <h3 className="task-editor__section-title">Blocks</h3>
                <ul className="task-editor__dep-list">{blocks.map((d) => refRow(d))}</ul>
              </>
            )}
          </section>
        )}

        <footer className="task-editor__foot">
          <button type="button" className="task-editor__cancel" onClick={onClose}>Cancel</button>
          {/* Busy is not disabled: the button keeps its colour and focus, and submit()'s
              in-flight guard ignores a second click. Disabled means "can't submit yet". */}
          <button
            type="button"
            className="task-editor__submit"
            onClick={submit}
            disabled={!title.trim() || prInvalid || hoursInvalid}
            aria-busy={saving}
          >
            {saving && <Loader2 className="task-editor__spinner" size={14} aria-hidden="true" />}
            {saving ? 'Saving…' : editing ? 'Save task' : 'Add task'}
          </button>
        </footer>

        {/* After the footer, so the form and its actions stay on the first screen; the
            backdrop scrolls a long thread. Posting never touches the form's fields. */}
        {editing && (
          <section className="task-editor__comments">
            <h3 className="task-editor__section-title">Comments</h3>
            <CommentThread
              key={task.id}
              parent={{ kind: 'tasks', id: task.id, key: task.key }}
              members={memberMap}
              onError={onCommentError ?? ignoreCommentError}
              onPosted={onCommentPosted}
            />
          </section>
        )}
      </div>
    </div>
  );
}
