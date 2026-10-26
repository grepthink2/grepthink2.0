import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import { SegmentedControl, type SegmentedOption } from '@components/SegmentedControl/SegmentedControl';
import Skeleton from '@components/Skeleton/Skeleton';
import { ToastStack } from '@components/Toast/Toast';
import { useToasts } from '@components/Toast/useToasts';
import { useAuth } from '@/lib/auth';
import { useSelectedClassRole } from '@/lib/classContext';
import type {
  ApiCreateStoryBody, ApiCreateTaskBody, ApiScrumBurnupUnit, ApiScrumStory, ApiScrumTask, ApiTaskRef,
  ApiUpdateTaskBody,
} from '@/lib/api';
import BacklogRow from '../components/BacklogRow';
import BurnupChart from '../components/BurnupChart';
import { BOARD_VIEWS, type BoardView } from '../config/boardViews';
import ScrumBoard from '../components/ScrumBoard';
import StoryCard from '../components/StoryCard';
import StoryModal from '../components/StoryModal';
import BoardSettingsModal from '../components/BoardSettingsModal';
import { Button } from '@components/Button/Button';
import SprintPicker from '../components/SprintPicker';
import SprintEditorModal, { type SprintDraft } from '../components/SprintEditorModal';
import StoryEditorModal from '../components/StoryEditorModal';
import TaskEditorModal from '../components/TaskEditorModal';
import { useScrumBoard } from '../hooks/useScrumBoard';
import { buildMemberMap } from '../scrumTypes';
import { isBacklogStory } from '../utils/backlog';
import { collectTasks } from '../utils/rollups';
import { newSprintDraft } from '../utils/sprints';
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

/** A team with no sprints: its class has no sprint schedule, which only the class's instructor sets. */
const NO_SCHEDULE = 'This class has no sprint schedule yet. Your instructor sets it in Class Settings.';
const NO_SCHEDULE_TEAM = 'This class has no sprint schedule yet. Your instructor sets it in Class Settings, or your team can create a sprint now.';
const SET_SCHEDULE = "Set the sprint schedule in Class Settings to create this team's sprints.";

const UNIT_OPTIONS: SegmentedOption<ApiScrumBurnupUnit>[] = [
  { value: 'points', label: 'Points' },
  { value: 'hours', label: 'Hours' },
];

/** Why a sprint's burnup is in hours: it has a task without points, or no task yet (spec D21). */
function hoursNote(withoutPoints: number): string {
  const count = withoutPoints > 0
    ? ` (${withoutPoints} ${withoutPoints === 1 ? 'task' : 'tasks'} without points)`
    : '';
  return `Burnup in hours · Add points to tasks for a points burnup${count}`;
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
    selectSprint, setBurnupUnit, moveTask, createStory, updateStory, deleteStory, createTask, updateTask,
    deleteTask, addDependency, removeDependency, updateSettings, refresh, createSprint,
  } = useScrumBoard(projectId, viewerName, user?.id);
  const { toasts, push, dismiss } = useToasts();
  // Your role in the selected class. The board's payload names no class, and a team's board is
  // normally opened from its own class, so the selected class stands in for the board's.
  const classRole = useSelectedClassRole();

  const view = parseView(searchParams.get('view'));
  const openTaskId = searchParams.get('task');
  const openStoryId = searchParams.get('story');
  const sprintParam = searchParams.get('sprint');
  const [addTaskStoryId, setAddTaskStoryId] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const [savingStory, setSavingStory] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  /** The New sprint form's starting values while it is open. */
  const [sprintDraft, setSprintDraft] = useState<SprintDraft | null>(null);
  const [savingSprint, setSavingSprint] = useState(false);
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

  // ?sprint= (search deep links): pick that sprint once the board knows it, then drop the
  // param so the sprint picker is free to move on. An unknown id is ignored — asking the
  // API for it would 404, which the hook renders as a board error.
  useEffect(() => {
    if (!board || !sprintParam) return;
    if (sprintParam !== board.sprint_id && board.sprints.some((s) => s.id === sprintParam)) {
      void selectSprint(sprintParam);
    }
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete('sprint');
      return params;
    }, { replace: true });
  }, [board, sprintParam, selectSprint, setSearchParams]);

  // A switch from the picker, or a unit from the burnup's toggle, shows the skeleton in place of the
  // whole board, so the control that had focus is gone. Give focus to the new one once the reloaded
  // board is on screen: the picker's trigger, or the toggle's checked option (a failed reload shows
  // the error block, and a toggle the reloaded sprint no longer offers is gone: nothing to focus).
  // Not after a ?sprint= deep link, which calls selectSprint itself: nothing had focus then.
  const pickerRef = useRef<HTMLButtonElement>(null);
  const unitToggleRef = useRef<HTMLDivElement>(null);
  const refocus = useRef<'picker' | 'unit' | null>(null);
  const pickSprint = (id: string) => {
    refocus.current = 'picker';
    void selectSprint(id);
  };
  const pickUnit = (unit: ApiScrumBurnupUnit) => {
    refocus.current = 'unit';
    void setBurnupUnit(unit);
  };
  useEffect(() => {
    if (loading || !refocus.current) return;
    const target = refocus.current === 'picker'
      ? pickerRef.current
      : unitToggleRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    refocus.current = null;
    target?.focus({ preventScroll: true });
  }, [loading]);

  /**
   * Patch ?task= / ?story= / ?sprint= in one navigation. setSearchParams does not queue like setState
   * (React Router's docs say so): each call starts from this render's params, so of two calls
   * in one event only the last lands. A handler that changes several passes them here, once.
   */
  const setParams = (patch: Partial<Record<'task' | 'story' | 'sprint', string | null>>) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      return params;
    }, { replace: true });
  };
  const setTaskParam = (taskId: string | null) => setParams({ task: taskId });
  /** The story modal is URL state too (?story=, a search deep link), like ?task=. */
  const setStoryParam = (storyId: string | null) => setParams({ story: storyId });

  const setView = (next: BoardView) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'board') params.delete('view');
      else params.set('view', next);
      return params;
    }, { replace: true });
  };

  const closeStory = () => {
    // Any ?task= left here names no task on this board (else its editor would show); it goes too.
    setParams({ story: null, task: null });
  };

  /** Board card or story row → the task's own detail. Closes the story. */
  const openTask = (task: ApiScrumTask) => {
    setParams({ story: null, task: task.id });
    setAddTaskStoryId(null);
  };

  /**
   * A dependency's (or dependent's) key in the task editor → that task (spec D6). One in the shown
   * sprint or the backlog opens in place; one in another sprint goes through ?sprint=, which the
   * deep-link effect above switches to, and the editor opens once that board is on screen.
   */
  const openTaskRef = (ref: ApiTaskRef) => {
    setAddTaskStoryId(null);
    const otherSprint = ref.sprint_id && ref.sprint_id !== board?.sprint_id ? ref.sprint_id : null;
    setParams({ story: null, task: ref.id, sprint: otherSprint });
  };

  /**
   * Back arrow inside the task editor → its parent story, task closed. One transition for both: the
   * router navigates in one, so a new-task editor closed on its own would commit a screen with no
   * modal before the story opens.
   */
  const backToStory = (storyId: string) => {
    startTransition(() => {
      setParams({ task: null, story: storyId });
      setAddTaskStoryId(null);
    });
  };

  /** Everything dismissed, back to the board. */
  const closeTaskEditor = () => {
    setTaskParam(null);
    setAddTaskStoryId(null);
  };

  const startAddTask = (storyId: string) => {
    setParams({ story: null, task: null });
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

  /** A refused delete leaves the story open: the hook's toast says why. */
  const handleDeleteStory = async (storyId: string) => {
    setDeletingStory(true);
    const ok = await deleteStory(storyId);
    setDeletingStory(false);
    if (ok) closeStory();              // drops ?story= and any stale ?task=
  };

  // The defaults read the clock, so they are worked out on the click, not during render.
  const openSprintEditor = () => setSprintDraft(newSprintDraft(board?.sprints ?? [], new Date()));
  // A class with a sprint schedule caps a team's sprints at its count; the API refuses one more.
  const sprintLimit = board?.project.sprint_limit ?? null;
  const canAddSprint = canWrite && (sprintLimit == null || (board?.sprints.length ?? 0) < sprintLimit);

  /** A new sprint is the one the board then shows, so a backlog story can move straight into it. */
  const handleCreateSprint = async (body: SprintDraft) => {
    setSavingSprint(true);
    const created = await createSprint(body);
    setSavingSprint(false);
    if (!created) return;              // the hook already raised the error toast
    setSprintDraft(null);
    pickSprint(created.id);
  };

  const handleCreateStory = async (body: ApiCreateStoryBody) => {
    setSavingStory(true);
    const created = await createStory(body);
    setSavingStory(false);
    if (!created) return;              // the hook already raised the error toast
    push('success', `${created.story.key} created`);
    // Continue the flow: land in the new story so its tasks can be added now. One transition closes
    // the editor and opens the story (the router navigates in one): never a commit with no modal.
    startTransition(() => {
      setCreatingStory(false);
      setStoryParam(created.story.id);
    });
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
  // A backend older than this client sends no unit fields, and its burnup is in points.
  const burnupUnit = board.burnup.unit ?? 'points';
  const unitsAvailable = board.burnup.units_available ?? [burnupUnit];
  // A sprint that draws in either unit offers both. One in hours that can't draw points says why
  // instead; one in hours by the viewer's choice needs no note, as the toggle already says it.
  const offersUnits = unitsAvailable.includes('points') && unitsAvailable.includes('hours');
  const unitNote = burnupUnit === 'hours' && !unitsAvailable.includes('points')
    ? hoursNote(board.burnup.tasks_without_points ?? 0)
    : null;
  // Only the class's instructor sets the sprint schedule. Staff access also covers the class's TAs
  // and the team's meeting TA, so the instructor's role in the class is needed as well.
  const setsSchedule = board.access === 'staff' && classRole === 'instructor';

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
            <SprintPicker
              ref={pickerRef}
              sprints={board.sprints}
              selectedId={board.sprint_id}
              onSelect={pickSprint}
              unit={burnupUnit}
              onNewSprint={canAddSprint ? openSprintEditor : undefined}
            />
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
                      onOpen={() => setStoryParam(s.id)}
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
              <p>{setsSchedule ? SET_SCHEDULE : canWrite ? NO_SCHEDULE_TEAM : NO_SCHEDULE}</p>
              {canWrite && (
                <Button size="sm" className="scrum-board__empty-action" onClick={openSprintEditor}>
                  Create a sprint
                </Button>
              )}
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
                  onOpen={() => setStoryParam(s.id)}
                  onMoveToSprint={canWrite && board.sprint_id
                    ? () => updateStory(s.id, { sprint_id: board.sprint_id })
                    : undefined}
                  sprintName={sprint?.name ?? ''}
                />
              ))}
            </div>
          ) : (
            <div className="scrum-board__empty-state">
              <h2>Backlog is empty</h2>
              <p>Stories that aren't in a sprint show up here.</p>
            </div>
          )
        )}

        {view === 'burnup' && (
          hasSprint ? (
            <>
              {(offersUnits || unitNote) && (
                <div className="scrum-board__burnup-unit">
                  {offersUnits && (
                    <SegmentedControl
                      ref={unitToggleRef}
                      options={UNIT_OPTIONS}
                      value={burnupUnit}
                      onChange={pickUnit}
                      ariaLabel="Burnup unit"
                      size="sm"
                    />
                  )}
                  {unitNote && <p className="scrum-board__burnup-note">{unitNote}</p>}
                </div>
              )}
              <div className="scrum-board__charts">
                {board.burnup.sprint && (
                  <div className="scrum-board__chart-panel">
                    <BurnupChart
                      labels={board.burnup.sprint.labels}
                      scope={board.burnup.sprint.scope}
                      completed={board.burnup.sprint.completed}
                      unit={burnupUnit}
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
                    unit={burnupUnit}
                    title="Cumulative burnup"
                    subtitle={board.burnup.cumulative.subtitle}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="scrum-board__empty-state">
              <h2>Nothing to chart yet</h2>
              <p>Burnup appears once the team has a sprint underway.</p>
            </div>
          )
        )}
      </div>

      {/* One modal at a time: the task editor takes precedence over the story
          detail, and opening either closes the other (maintainer 2026-09-10).
          Keyed by task: another ?task= starts a fresh form, while a refetch of the same
          task (after a comment is posted) keeps the unsaved edits. */}
      {openTaskPair && (
        <TaskEditorModal
          key={openTaskPair.task.id}
          story={openTaskPair.story}
          task={openTaskPair.task}
          members={board.members}
          scale={board.project.estimate_scale}
          saving={savingTask}
          onClose={closeTaskEditor}
          onBack={() => backToStory(openTaskPair.story.id)}
          onSave={(body) => handleSaveTask(openTaskPair.task.id, body)}
          // Staff never move tasks, and the optimistic move only knows sprint stories.
          onMove={canWrite && !isBacklogStory(openTaskPair.story)
            ? (to) => moveTask(openTaskPair.task.id, to)
            : undefined}
          onCommentError={(m) => push('error', m)}
          onCommentPosted={refresh}
          sprints={board.sprints}
          taskIndex={board.task_index ?? []}
          onOpenRef={openTaskRef}
          // Staff see both lists and change neither (spec D7).
          onAddDependency={canWrite ? (id) => addDependency(openTaskPair.task.id, id) : undefined}
          onRemoveDependency={canWrite ? (id) => removeDependency(openTaskPair.task.id, id) : undefined}
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
          sprints={board.sprints}
          taskIndex={board.task_index ?? []}
          onOpenRef={openTaskRef}
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
          onDeleteStory={() => handleDeleteStory(openStory.id)}
          deleting={deletingStory}
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

      {sprintDraft && (
        <SprintEditorModal
          defaults={sprintDraft}
          saving={savingSprint}
          onClose={() => setSprintDraft(null)}
          onCreate={handleCreateSprint}
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
