import { useCallback, useState } from 'react';
import type { ApiScrumTask } from '@/lib/api';
import { useGlobalDragEnd } from '@features/app/components/Project/Assign/useGlobalDragEnd';
import { BOARD_COLUMNS, statusLabel } from '../config/scrumTags';
import type { BoardStatus } from '../config/scrumTags';
import { columnPoints, tasksIn } from '../utils/rollups';
import type { MemberMap } from '../scrumTypes';
import TaskCard from './TaskCard';

interface Props {
  tasks: ApiScrumTask[];
  members: MemberMap;
  /** story_id -> story key, for the parent chip on each card. */
  storyKeys: Record<string, string>;
  /** Staff read the board but never move cards (D2). */
  canWrite?: boolean;
  onMove?: (taskId: string, to: BoardStatus) => void;
  onOpenTask?: (task: ApiScrumTask) => void;
}

/**
 * The three fixed columns with HTML5 drag & drop — the same mechanic the
 * Assign board uses (bare id on `text/plain`, modifier classes for state).
 *
 * Dragging is mouse-only by nature; the keyboard/AT path is the status
 * select in the task detail (F5), which every card links to via Enter.
 */
export default function ScrumBoard({
  tasks, members, storyKeys, canWrite = true, onMove, onOpenTask,
}: Props) {
  const [overCol, setOverCol] = useState<BoardStatus | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  /** `dragend` always fires on the source, so transient state can never stick. */
  const clearDrag = useCallback(() => {
    setOverCol(null);
    setDragId(null);
  }, []);
  useGlobalDragEnd(clearDrag);

  const handleDrop = (col: BoardStatus) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    clearDrag();
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (task && task.status !== col) onMove?.(id, col);
  };

  return (
    <div className="gt-board">
      {BOARD_COLUMNS.map((col) => {
        const colTasks = tasksIn(tasks, col.id);
        const isOver = canWrite && overCol === col.id;
        return (
          <section
            key={col.id}
            className={`gt-board__col gt-board__col--${col.id}${isOver ? ' gt-board__col--over' : ''}`}
            aria-label={`${col.label} column`}
            onDragOver={canWrite ? (e) => { e.preventDefault(); setOverCol(col.id); } : undefined}
            onDragLeave={canWrite ? (e) => {
              // Ignore moves between children — only a real exit clears the highlight.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverCol(null);
            } : undefined}
            onDrop={canWrite ? handleDrop(col.id) : undefined}
          >
            <header className="gt-board__head">
              <span className={`gt-board__dot gt-board__dot--${col.id}`} aria-hidden="true" />
              <span className="gt-board__label">{col.label}</span>
              <span className="gt-board__count">{colTasks.length}</span>
              <span className="gt-board__pts">{columnPoints(tasks, col.id)} pts</span>
            </header>

            <div className="gt-board__cards">
              {colTasks.map((t) => (
                <div
                  key={t.id}
                  draggable={canWrite}
                  className={`gt-board__drag${dragId === t.id ? ' gt-board__drag--ghost' : ''}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', t.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(t.id);
                  }}
                  onDragEnd={clearDrag}
                >
                  <TaskCard
                    task={t}
                    members={members}
                    storyKey={storyKeys[t.story_id]}
                    onOpen={onOpenTask ? () => onOpenTask(t) : undefined}
                  />
                </div>
              ))}

              {colTasks.length === 0 && (
                <div className="gt-board__empty">
                  {canWrite ? `Drop tasks here` : `Nothing in ${statusLabel(col.id)}`}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
