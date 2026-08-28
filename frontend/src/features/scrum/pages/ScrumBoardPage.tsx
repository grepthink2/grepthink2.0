import { useMemo, useState } from 'react';
import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import Skeleton from '@components/Skeleton/Skeleton';
import { useAuth } from '@/lib/auth';
import type { ApiScrumStory, ApiScrumTask } from '@/lib/api';
import BacklogRow from '../components/BacklogRow';
import BurnupChart from '../components/BurnupChart';
import ScrumBoard from '../components/ScrumBoard';
import StoryCard from '../components/StoryCard';
import StoryModal from '../components/StoryModal';
import { useScrumBoard } from '../hooks/useScrumBoard';
import { buildMemberMap } from '../scrumTypes';
import { collectTasks } from '../utils/rollups';
import '../scrum.scss';
import './ScrumBoardPage.scss';

/** The three full-width sub-views (L2). Tab state lives in `?view=`. */
export const BOARD_VIEWS = ['board', 'backlog', 'burnup'] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];

const VIEW_LABELS: Record<BoardView, string> = {
  board: 'Board',
  backlog: 'Backlog',
  burnup: 'Burnup',
};

function parseView(raw: string | null): BoardView {
  return BOARD_VIEWS.includes(raw as BoardView) ? (raw as BoardView) : 'board';
}

/** Loading shell — mirrors the real layout so there is no shift on data arrival. */
export function ScrumBoardSkeleton() {
  return (
    <div className="scrum-board" aria-busy="true">
      <div className="scrum-board__header">
        <Skeleton width={180} height={26} />
        <div className="scrum-board__header-actions">
          <Skeleton width={140} height={34} radius={7} />
          <Skeleton width={34} height={34} radius={7} />
          <Skeleton width={110} height={34} radius={7} />
        </div>
      </div>
      <Skeleton width={260} height={30} radius={7} />
      <div className="scrum-board__stories">
        {[0, 1, 2].map((i) => <Skeleton key={i} height={92} radius={10} />)}
      </div>
      <div className="scrum-board__columns">
        {[0, 1, 2].map((i) => <Skeleton key={i} height={220} radius={10} />)}
      </div>
    </div>
  );
}

/** Per-project scrum board (spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md). */
export default function ScrumBoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  const viewerName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name
    ?? user?.email
    ?? 'You';

  const {
    board, loading, error, notice, clearNotice, canWrite,
    selectSprint, moveTask, updateStory, createTask, deleteTask,
  } = useScrumBoard(projectId, viewerName);

  const view = parseView(searchParams.get('view'));
  const openTaskId = searchParams.get('task');
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const [storyFilter, setStoryFilter] = useState<string | null>(null);
  const projectName = (location.state as { projectName?: string } | null)?.projectName;

  const members = useMemo(() => buildMemberMap(board?.members ?? []), [board?.members]);
  const storyKeys = useMemo(() => {
    const all = [...(board?.stories ?? []), ...(board?.backlog ?? [])];
    return Object.fromEntries(all.map((s) => [s.id, s.key]));
  }, [board?.stories, board?.backlog]);

  const tasks = useMemo(
    () => collectTasks(board?.stories ?? [], storyFilter),
    [board?.stories, storyFilter],
  );

  /** A task deep link (?task=, used by mention notifications) opens its story. */
  const allStories = useMemo(
    () => [...(board?.stories ?? []), ...(board?.backlog ?? [])],
    [board?.stories, board?.backlog],
  );
  const openStory: ApiScrumStory | null = useMemo(() => {
    if (openStoryId) return allStories.find((s) => s.id === openStoryId) ?? null;
    if (openTaskId) return allStories.find((s) => s.tasks.some((t) => t.id === openTaskId)) ?? null;
    return null;
  }, [allStories, openStoryId, openTaskId]);

  const setView = (next: BoardView) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'board') params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const closeStory = () => {
    setOpenStoryId(null);
    if (openTaskId) {
      const params = new URLSearchParams(searchParams);
      params.delete('task');
      setSearchParams(params, { replace: true });
    }
  };

  const openTask = (task: ApiScrumTask) => {
    const params = new URLSearchParams(searchParams);
    params.set('task', task.id);
    setSearchParams(params, { replace: true });
  };

  if (loading) return <ScrumBoardSkeleton />;

  if (error || !board) {
    return (
      <div className="scrum-board">
        <div className="scrum-board__error">
          <h2>Unable to load the board</h2>
          <p>{error ?? 'This project has no board yet.'}</p>
        </div>
      </div>
    );
  }

  const sprint = board.sprints.find((s) => s.id === board.sprint_id) ?? null;
  const hasSprint = Boolean(sprint);

  return (
    <div className="scrum-board">
      <div className="scrum-board__header">
        <div>
          <h1 className="scrum-board__title">Scrum Board</h1>
          {projectName && <p className="scrum-board__subtitle">{projectName}</p>}
        </div>
        <div className="scrum-board__header-actions">
          {board.sprints.length > 0 && (
            <label className="scrum-board__sprint-select">
              <span className="sr-only">Sprint</span>
              <select value={board.sprint_id ?? ''} onChange={(e) => selectSprint(e.target.value)}>
                {board.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="scrum-board__icon-button" aria-label="Board settings" disabled>
            <Settings size={16} />
          </button>
          <button type="button" className="scrum-board__primary" disabled={!canWrite}>
            New Story
          </button>
        </div>
      </div>

      {notice && (
        <div className={`scrum-board__notice scrum-board__notice--${notice.kind}`} role="status">
          <span>{notice.message}</span>
          <button type="button" onClick={clearNotice} aria-label="Dismiss message">×</button>
        </div>
      )}

      <div className="scrum-board__views" role="tablist" aria-label="Board views">
        {BOARD_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={`scrum-board__view${view === v ? ' scrum-board__view--active' : ''}`}
            onClick={() => setView(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      <div className="scrum-board__panel" role="tabpanel" aria-label={VIEW_LABELS[view]}>
        {view === 'board' && (
          hasSprint ? (
            <>
              {board.stories.length > 0 && (
                <div className="scrum-board__stories">
                  {board.stories.map((s) => (
                    <StoryCard
                      key={s.id}
                      story={s}
                      members={members}
                      active={storyFilter === s.id}
                      onSelect={() => setStoryFilter(storyFilter === s.id ? null : s.id)}
                    />
                  ))}
                </div>
              )}
              {storyFilter && (
                <button type="button" className="scrum-board__clear-filter" onClick={() => setStoryFilter(null)}>
                  Showing one story — show all
                </button>
              )}
              <ScrumBoard
                tasks={tasks}
                members={members}
                storyKeys={storyKeys}
                canWrite={canWrite}
                onMove={moveTask}
                onOpenTask={openTask}
              />
            </>
          ) : (
            <div className="scrum-board__empty-state">
              <h2>No sprints yet</h2>
              <p>Create a sprint to start planning stories and tasks.</p>
            </div>
          )
        )}

        {view === 'backlog' && (
          board.backlog.length > 0 ? (
            <div className="scrum-board__backlog">
              {board.backlog.map((s) => (
                <BacklogRow
                  key={s.id}
                  story={s}
                  members={members}
                  onOpen={() => setOpenStoryId(s.id)}
                  onRestore={canWrite && board.sprint_id
                    ? () => updateStory(s.id, { sprint_id: board.sprint_id })
                    : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="scrum-board__empty-state">
              <h2>Backlog is empty</h2>
              <p>Stories you archive or leave unscheduled show up here.</p>
            </div>
          )
        )}

        {view === 'burnup' && (
          hasSprint ? (
            <div className="scrum-board__charts">
              {board.burnup.sprint && (
                <div className="scrum-board__chart-panel">
                  <BurnupChart
                    labels={board.burnup.sprint.labels}
                    scope={board.burnup.sprint.scope}
                    completed={board.burnup.sprint.completed}
                    title={`${sprint!.name} burnup`}
                    subtitle={board.burnup.sprint.subtitle}
                  />
                </div>
              )}
              <div className="scrum-board__chart-panel">
                <BurnupChart
                  labels={board.burnup.cumulative.labels}
                  scope={board.burnup.cumulative.scope}
                  completed={board.burnup.cumulative.completed}
                  title="Cumulative burnup"
                  subtitle={board.burnup.cumulative.subtitle}
                />
              </div>
            </div>
          ) : (
            <div className="scrum-board__empty-state">
              <h2>Nothing to chart yet</h2>
              <p>Burnup appears once the team has a sprint underway.</p>
            </div>
          )
        )}
      </div>

      {openStory && (
        <StoryModal
          story={openStory}
          members={members}
          sprints={board.sprints}
          scale={board.project.estimate_scale}
          focusTaskId={openTaskId}
          canWrite={canWrite}
          onClose={closeStory}
          onUpdateStory={(body) => updateStory(openStory.id, body)}
          onCreateTask={(title) => createTask(openStory.id, { title })}
          onDeleteTask={deleteTask}
          onMoveTask={moveTask}
        />
      )}
    </div>
  );
}
