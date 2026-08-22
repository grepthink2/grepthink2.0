import React from 'react';
import { TaskCard } from './TaskCard.jsx';

export const BOARD_COLUMNS = [
  { id: 'todo', label: 'TODO' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

/**
 * Three-column scrum board (TODO / In Progress / Done) with HTML5
 * drag & drop. Controlled: pass `tasks` (each with a `status` of
 * 'todo' | 'in_progress' | 'done') and update state in `onMove` —
 * record the audit (`moved: {to, by, at}`) there.
 */
export function ScrumBoard({ tasks = [], onMove, onOpenTask, className = '' }) {
  const [overCol, setOverCol] = React.useState(null);
  const [dragId, setDragId] = React.useState(null);

  const drop = (colId) => (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setOverCol(null);
    setDragId(null);
    if (!id) return;
    const task = tasks.find((t) => String(t.id) === String(id));
    if (task && task.status !== colId && onMove) onMove(task.id, colId);
  };

  return (
    <div className={['gt-board', className].filter(Boolean).join(' ')}>
      {BOARD_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        const pts = colTasks.reduce((s, t) => s + (Number(t.points) || 0), 0);
        return (
          <section
            key={col.id}
            className={['gt-board__col', `gt-board__col--${col.id}`, overCol === col.id ? 'gt-board__col--over' : ''].filter(Boolean).join(' ')}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null); }}
            onDrop={drop(col.id)}
            aria-label={`${col.label} column`}
          >
            <header className="gt-board__head">
              <span className={`gt-board__dot gt-board__dot--${col.id}`} aria-hidden="true" />
              <span className="gt-board__label">{col.label}</span>
              <span className="gt-board__count">{colTasks.length}</span>
              <span className="gt-board__pts">{pts} pts</span>
            </header>
            <div className="gt-board__cards">
              {colTasks.map((t) => (
                <div
                  key={t.id}
                  draggable
                  className={['gt-board__drag', dragId === String(t.id) ? 'gt-board__drag--ghost' : ''].filter(Boolean).join(' ')}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(t.id)); e.dataTransfer.effectAllowed = 'move'; setDragId(String(t.id)); }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                >
                  <TaskCard
                    taskKey={t.taskKey}
                    storyKey={t.storyKey}
                    title={t.title}
                    tags={t.tags}
                    points={t.points}
                    estimate={t.estimate}
                    reporter={t.reporter}
                    assignee={t.assignee}
                    pr={t.pr}
                    moved={t.moved}
                    commentCount={t.commentCount}
                    onOpen={onOpenTask ? () => onOpenTask(t) : undefined}
                  />
                </div>
              ))}
              {colTasks.length === 0 && <div className="gt-board__empty">Drop tasks here</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
