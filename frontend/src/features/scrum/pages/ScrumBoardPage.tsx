import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import Skeleton from '@components/Skeleton/Skeleton';
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
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={92} radius={10} />
        ))}
      </div>
      <div className="scrum-board__columns">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={220} radius={10} />
        ))}
      </div>
    </div>
  );
}

/**
 * Per-project scrum board (spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md).
 *
 * F1 ships the route, shell and tab plumbing; the story grid, DnD columns,
 * backlog and burnup panels arrive in F2–F6.
 */
export default function ScrumBoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const view = parseView(searchParams.get('view'));
  const projectName = (location.state as { projectName?: string } | null)?.projectName;

  const selectView = (next: BoardView) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'board') params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="scrum-board" data-project-id={projectId}>
      <div className="scrum-board__header">
        <h1 className="scrum-board__title">Scrum Board</h1>
      </div>

      <div className="scrum-board__views" role="tablist" aria-label="Board views">
        {BOARD_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={`scrum-board__view${view === v ? ' scrum-board__view--active' : ''}`}
            onClick={() => selectView(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      <div className="scrum-board__panel" role="tabpanel">
        <p className="scrum-board__placeholder">
          {VIEW_LABELS[view]} for {projectName ?? 'this project'} lands in the next tasks.
        </p>
      </div>
    </div>
  );
}
