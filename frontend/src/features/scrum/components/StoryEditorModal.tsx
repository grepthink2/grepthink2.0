import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ApiCreateStoryBody, ApiScrumMember, ApiScrumSprint } from '@/lib/api';
import type { EstimateScale } from '../config/scrumTags';
import { PointPicker } from './ScalePicker';
import './StoryEditorModal.scss';

interface Props {
  members: ApiScrumMember[];
  sprints: ApiScrumSprint[];
  /** Sprint the board is currently showing — the default for a new story. */
  currentSprintId: string | null;
  scale: EstimateScale;
  saving?: boolean;
  onClose: () => void;
  onCreate: (body: ApiCreateStoryBody) => void;
}

/**
 * Create a User Story (F13). Deliberately create-only: editing happens in
 * StoryModal, where the story's tasks and comments are also in reach.
 *
 * On success the caller opens the new story's detail, so the intended flow —
 * New Story → story → add tasks — continues without a second hunt.
 */
export default function StoryEditorModal({
  members, sprints, currentSprintId, scale, saving = false, onClose, onCreate,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState<number | undefined>();
  const [estimate, setEstimate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [sprintId, setSprintId] = useState(currentSprintId ?? '');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    titleRef.current?.focus();
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    onCreate({
      title: trimmed,
      ...(description.trim() ? { description_md: description.trim() } : {}),
      ...(points != null ? { points } : {}),
      ...(estimate.trim() ? { time_estimate: estimate.trim() } : {}),
      ...(assignee ? { assignee_id: assignee } : {}),
      // Omitted = backlog on create (the controller only sets non-null fields),
      // and the create body types sprint_id as optional rather than nullable.
      ...(sprintId ? { sprint_id: sprintId } : {}),
    });
  };

  return (
    <div className="story-editor-backdrop" onClick={onClose} role="presentation">
      <div
        className="story-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="story-editor__close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <h2 className="story-editor__title" id="story-editor-title">New story</h2>

        <label className="story-editor__field">
          <span className="story-editor__label">Title</span>
          <input
            ref={titleRef}
            type="text"
            value={title}
            maxLength={200}
            placeholder="What should the team build?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </label>

        {/* The hint sits outside the label so it can't leak into the
            textarea's accessible name; aria-describedby still announces it. */}
        <div className="story-editor__field">
          <label className="story-editor__label" htmlFor="story-editor-description">Description</label>
          <textarea
            id="story-editor-description"
            aria-describedby="story-editor-description-hint"
            rows={4}
            value={description}
            placeholder="Acceptance criteria, links, anything the team needs…"
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className="story-editor__hint" id="story-editor-description-hint">
            **bold** · `code` · - lists
          </span>
        </div>

        <div className="story-editor__field">
          <span className="story-editor__label">Points</span>
          <PointPicker scale={scale} value={points} onChange={setPoints} />
        </div>

        <div className="story-editor__row">
          <label className="story-editor__field">
            <span className="story-editor__label">Time estimate</span>
            <input
              type="text"
              value={estimate}
              maxLength={20}
              placeholder="2d"
              onChange={(e) => setEstimate(e.target.value)}
            />
          </label>

          <label className="story-editor__field">
            <span className="story-editor__label">Assignee</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
          </label>

          <label className="story-editor__field">
            <span className="story-editor__label">Sprint</span>
            <select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              <option value="">Backlog</option>
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>

        <footer className="story-editor__foot">
          <button type="button" className="story-editor__cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="story-editor__submit"
            onClick={submit}
            disabled={!title.trim() || saving}
          >
            {saving ? 'Creating…' : 'Create story'}
          </button>
        </footer>
      </div>
    </div>
  );
}
