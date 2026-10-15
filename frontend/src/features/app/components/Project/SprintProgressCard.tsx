import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { api } from '@/lib/api';
import type { ApiScrumBoard, ApiScrumSprint } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { sprintProgress } from '@features/scrum/utils/rollups';
import './SprintProgressCard.scss';

type LoadStatus = 'loading' | 'ready' | 'forbidden' | 'error';

const STATUS_LABELS: Record<ApiScrumSprint['status'], string> = {
  active: 'Active',
  planned: 'Planned',
  completed: 'Completed',
};

/** "Sep 7 – Sep 20" from the sprint's ISO dates. */
function sprintDates({ starts_at, ends_at }: ApiScrumSprint): string {
  return `${format(parseISO(starts_at), 'MMM d')} – ${format(parseISO(ends_at), 'MMM d')}`;
}

interface SprintProgressCardProps {
  projectId: string;
  /** Rides in the board link's state, so the board's back link can name the project. */
  projectName?: string;
}

/**
 * The project page's sprint card: task counts and progress for the sprint the board opens on,
 * the backlog size, and a link to the board. It reads the board endpoint, which answers 403 to
 * anyone outside the team and the class staff.
 */
export default function SprintProgressCard({ projectId, projectName }: SprintProgressCardProps) {
  const headingId = useId();
  const [board, setBoard] = useState<ApiScrumBoard | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');

  // Another project starts over from the skeleton. Reset during render (react.dev, "adjusting
  // state when a prop changes"), not in the load effect, so that effect never sets state synchronously.
  const [boardFor, setBoardFor] = useState(projectId);
  if (boardFor !== projectId) {
    setBoardFor(projectId);
    setBoard(null);
    setStatus('loading');
  }

  // Only the newest request may commit, so a slow answer for the previous project is dropped.
  const requestSeq = useRef(0);
  useEffect(() => {
    const seq = ++requestSeq.current;
    // A promise chain: react-hooks/set-state-in-effect accepts setState in its callbacks.
    api
      .getScrumBoard(projectId)
      .then((next) => {
        if (seq !== requestSeq.current) return;
        setBoard(next);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return;
        setStatus(err instanceof ApiError && err.status === 403 ? 'forbidden' : 'error');
      });
  }, [projectId]);

  const boardLink = (
    <Link
      to={`/app/projects/${projectId}/board`}
      state={projectName ? { projectName } : undefined}
      className="sprint-progress__link"
    >
      Open board <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );

  let body: ReactNode = null;
  if (status === 'loading') {
    // The link needs no data, and this card is the page's only way to the board, so a slow
    // request must not hide it.
    body = (
      <>
        <div className="sprint-progress__skeleton">
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="100%" />
          <Skeleton height={14} width="40%" />
        </div>
        {boardLink}
      </>
    );
  } else if (status === 'forbidden') {
    body = <p className="sprint-progress__note">Only the team and class staff can see the board.</p>;
  } else if (status === 'error') {
    body = (
      <>
        <p className="sprint-progress__note">Couldn't load the board.</p>
        {boardLink}
      </>
    );
  } else if (board) {
    const { sprint, todo, inProgress, done, percent, backlogStories } = sprintProgress(board);
    body = sprint ? (
      <>
        <p className="sprint-progress__sprint">
          <span className="sprint-progress__sprint-name">{sprint.name}</span>
          <span className="sprint-progress__dates"> · {sprintDates(sprint)}</span>{' '}
          <span className={`sprint-progress__status sprint-progress__status--${sprint.status}`}>
            {STATUS_LABELS[sprint.status]}
          </span>
        </p>
        <dl className="sprint-progress__counts">
          <div className="sprint-progress__count">
            <dt>To do</dt>
            <dd>{todo}</dd>
          </div>
          <div className="sprint-progress__count">
            <dt>In progress</dt>
            <dd>{inProgress}</dd>
          </div>
          <div className="sprint-progress__count">
            <dt>Done</dt>
            <dd className="sprint-progress__value--done">{done}</dd>
          </div>
        </dl>
        <div
          className="sprint-progress__bar"
          role="progressbar"
          aria-label="Tasks done"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="sprint-progress__bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="sprint-progress__backlog">
          {`${backlogStories} ${backlogStories === 1 ? 'story' : 'stories'} in the backlog`}
        </p>
        {boardLink}
      </>
    ) : (
      <>
        <p className="sprint-progress__note">No sprints yet</p>
        {boardLink}
      </>
    );
  }

  return (
    <section
      className="project-view__card sprint-progress"
      aria-labelledby={headingId}
      aria-busy={status === 'loading'}
    >
      <h3 id={headingId} className="sprint-progress__title">Sprint progress</h3>
      {body}
    </section>
  );
}
