import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import Skeleton from '@components/Skeleton/Skeleton';
import { ToastStack } from '@components/Toast/Toast';
import { useToasts } from '@components/Toast/useToasts';
import { useAuth } from '@/lib/auth';
import type {
  ApiCreateStoryBody, ApiCreateTaskBody, ApiScrumStory, ApiScrumTask, ApiUpdateTaskBody,
} from '@/lib/api';
import BacklogRow from '../components/BacklogRow';
import BurnupChart from '../components/BurnupChart';
import { BOARD_VIEWS, type BoardView } from '../config/boardViews';
import ScrumBoard from '../components/ScrumBoard';
import StoryCard from '../components/StoryCard';
import StoryModal from '../components/StoryModal';
import BoardSettingsModal from '../components/BoardSettingsModal';
import StoryEditorModal from '../components/StoryEditorModal';
import TaskEditorModal from '../components/TaskEditorModal';
import { useScrumBoard } from '../hooks/useScrumBoard';
import { buildMemberMap } from '../scrumTypes';
import { collectTasks } from '../utils/rollups';
import '../scrum.scss';
import './ScrumBoardPage.scss';


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
    selectSprint, moveTask, createStory, updateStory, createTask, updateTask, deleteTask,
    updateSettings, refresh,
  } = useScrumBoard(projectId, viewerName, user?.id);
  const { toasts, push, dismiss } = useToasts();

  const view = parseView(searchParams.get('view'));
  const openTaskId = searchParams.get('task');
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const [addTaskStoryId, setAddTaskStoryId] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const [savingStory, setSavingStory] = useState(false);
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

  const allStories = useMemo(
    () => [...(board?.stories ?? []), ...(board?.backlog ?? [])],
    [board?.stories, board?.backlog],
  );

  /**
   * Exactly one modal is ever on screen (maintainer 2026-09-10). A task deep
   * link (?task=, also what a mention notification links to) opens the *task*,
   * with its story reachable by the back arrow; the story detail opens on its
   * own. They swap rather than stacking.
   */
  const openTaskPair = useMemo(() => {
    if (!openTaskId) return null;
    // find() rather than a loop with an early return, which the React Compiler's
    // analysis (react-hooks/preserve-manual-memoization) cannot keep memoized.
    const story = allStories.find((s) => s.tasks.some((x) => x.id === openTaskId));
    const task = story?.tasks.find((x) => x.id === openTaskId);
    return story && task ? { story, task } : null;
  }, [allStories, openTaskId]);

  const openStory: ApiScrumStory | null = useMemo(
    () => (openStoryId ? allStories.find((s) => s.id === openStoryId) ?? null : null),
    [allStories, openStoryId],
  );

  /** Story whose "Add task" was pressed — create mode for the same editor. */
  const addTaskStory: ApiScrumStory | null = useMemo(
    () => (addTaskStoryId ? allStories.find((s) => s.id === addTaskStoryId) ?? null : null),
    [allStories, addTaskStoryId],
  );

  // The hook reports one notice at a time; hand each to the stack exactly once.
  useEffect(() => {
    if (!notice) return;
    push(notice.kind, notice.message);
    clearNotice();
  }, [notice, push, clearNotice]);

  const setView = (next: BoardView) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'board') params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const setTaskParam = (taskId: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (taskId) params.set('task', taskId);
    else params.delete('task');
    setSearchParams(params, { replace: true });
  };

  const closeStory = () => {
    setOpenStoryId(null);
    if (openTaskId) setTaskParam(null);
  };

  /** Board card or story row → the task's own detail. Closes the story. */
  const openTask = (task: ApiScrumTask) => {
    setOpenStoryId(null);
    setAddTaskStoryId(null);
    setTaskParam(task.id);
  };

  /** Back arrow inside the task editor → its parent story, task closed. */
  const backToStory = (storyId: string) => {
    setTaskParam(null);
    setAddTaskStoryId(null);
    setOpenStoryId(storyId);
  };

  /** Everything dismissed, back to the board. */
  const closeTaskEditor = () => {
    setTaskParam(null);
    setAddTaskStoryId(null);
  };

  const startAddTask = (storyId: string) => {
    setOpenStoryId(null);
    setTaskParam(null);
    setAddTaskStoryId(storyId);
  };

  const handleCreateTask = async (storyId: string, body: ApiCreateTaskBody) => {
    setSavingTask(true);
    await createTask(storyId, body);
    setSavingTask(false);
    // Land back on the story so the new task is visible in context.
    backToStory(storyId);
  };

  const handleSaveTask = async (taskId: string, body: ApiUpdateTaskBody) => {
    setSavingTask(true);
    await updateTask(taskId, body);
    setSavingTask(false);
    closeTaskEditor();
  };

  const handleCreateStory = async (body: ApiCreateStoryBody) => {
    setSavingStory(true);
    const created = await createStory(body);
    setSavingStory(false);
    if (!created) return;              // the hook already raised the error toast
    setCreatingStory(false);
    push('success', `${created.story.key} created`);
    // Continue the flow: land in the new story so its tasks can be added now.
    setOpenStoryId(created.story.id);
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
          <Link
            to={`/app/projects/${projectId}`}
            state={projectName ? { projectName } : undefined}
            className="scrum-board__back"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {projectName ? `Back to ${projectName}` : 'Back to project'}
          </Link>
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
          <button
            type="button"
            className="scrum-board__icon-button"
            aria-label="Board settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            className="scrum-board__primary"
            disabled={!canWrite}
            onClick={() => setCreatingStory(true)}
          >
            New Story
          </button>
        </div>
      </div>

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
                      onOpen={() => setOpenStoryId(s.id)}
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

      {/* One modal at a time: the task editor takes precedence over the story
          detail, and opening either closes the other (maintainer 2026-09-10). */}
      {openTaskPair && (
        <TaskEditorModal
          story={openTaskPair.story}
          task={openTaskPair.task}
          members={board.members}
          scale={board.project.estimate_scale}
          saving={savingTask}
          onClose={closeTaskEditor}
          onBack={() => backToStory(openTaskPair.story.id)}
          onSave={(body) => handleSaveTask(openTaskPair.task.id, body)}
        />
      )}

      {!openTaskPair && addTaskStory && (
        <TaskEditorModal
          story={addTaskStory}
          members={board.members}
          scale={board.project.estimate_scale}
          saving={savingTask}
          onClose={closeTaskEditor}
          onBack={() => backToStory(addTaskStory.id)}
          onCreate={(body) => handleCreateTask(addTaskStory.id, body)}
        />
      )}

      {!openTaskPair && !addTaskStory && openStory && (
        <StoryModal
          story={openStory}
          members={members}
          sprints={board.sprints}
          scale={board.project.estimate_scale}
          canWrite={canWrite}
          onClose={closeStory}
          onUpdateStory={(body) => updateStory(openStory.id, body)}
          onOpenTask={openTask}
          onAddTask={() => startAddTask(openStory.id)}
          onDeleteTask={deleteTask}
          onMoveTask={moveTask}
          onCommentError={(m) => push('error', m)}
          onCommentPosted={refresh}
        />
      )}

      {creatingStory && (
        <StoryEditorModal
          members={board.members}
          sprints={board.sprints}
          currentSprintId={board.sprint_id}
          scale={board.project.estimate_scale}
          saving={savingStory}
          onClose={() => setCreatingStory(false)}
          onCreate={handleCreateStory}
        />
      )}

      {settingsOpen && projectId && (
        <BoardSettingsModal
          projectId={projectId}
          scale={board.project.estimate_scale}
          canWrite={canWrite}
          onClose={() => setSettingsOpen(false)}
          onChangeScale={updateSettings}
          onNotice={push}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
