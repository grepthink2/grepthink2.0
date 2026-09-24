import React from 'react';
import {
  ArrowRight,
  Clock,
  GitMerge,
  GitPullRequest,
  Hash,
  MessageSquare,
  Move,
  Repeat2,
  TrendingUp,
} from 'lucide-react';
import { BAND_BADGES, SECTION_IDS } from '../../landing.config';
import Spotlight, { type SpotlightPoint } from './Spotlight';
import StageCard from './StageCard';
import StageSwap from './StageSwap';
import './ScrumSpotlight.scss';

const POINTS: SpotlightPoint[] = [
  { icon: Move, text: 'Drag-and-drop board with a history of every move' },
  { icon: Hash, text: "Story points and time estimates, on your team's own scale" },
  { icon: GitPullRequest, text: 'Tasks linked to GitHub and git.ucsc.edu pull requests' },
  { icon: TrendingUp, text: 'Burnup charts for each sprint and the whole project' },
];

interface MiniTaskProps {
  taskKey: string;
  title: string;
  points: number;
  className?: string;
}

const MiniTask: React.FC<MiniTaskProps> = ({ taskKey, title, points, className = '' }) => (
  <span className={`scrum-mini ${className}`.trim()}>
    <span className="scrum-mini__key">
      {taskKey}
      <b>{points}</b>
    </span>
    <span className="scrum-mini__title">{title}</span>
  </span>
);

const ScrumSpotlight: React.FC = () => (
  <Spotlight
    id={SECTION_IDS.scrum}
    label="Scrum board"
    badge={BAND_BADGES.scrum}
    title="Run every sprint from"
    accent="one board"
    lead="Break your project into sprints, user stories and tasks. Drag work across the board, estimate it in points, and link each task to its pull request. Every move is logged, so your TA sees progress as it happens."
    points={POINTS}
    textSide="left"
  >
    <StageCard className="scrum-board-card" order={0}>
      <div className="stage-card__head">
        <span className="stage-card__title">Sprint 3</span>
        <span className="stage-card__meta">4 days left</span>
      </div>
      <div className="scrum-board__cols">
        <div className="scrum-board__col">
          <div className="scrum-board__col-head">
            <span className="scrum-board__dot scrum-board__dot--todo" />
            TODO
            <span className="scrum-board__count">2</span>
          </div>
          <MiniTask taskKey="GT-15" title="Invite flow copy" points={2} />
          <MiniTask taskKey="GT-16" title="Export grades CSV" points={5} />
        </div>
        <div className="scrum-board__col">
          <div className="scrum-board__col-head">
            <span className="scrum-board__dot scrum-board__dot--doing" />
            In Progress
            <span className="scrum-board__count">
              <StageSwap before={2} after={1} />
            </span>
          </div>
          <div className="scrum-board__slot" />
          <MiniTask taskKey="GT-9" title="Attendance tab" points={3} />
        </div>
        <div className="scrum-board__col">
          <div className="scrum-board__col-head">
            <span className="scrum-board__dot scrum-board__dot--done" />
            Done
            <span className="scrum-board__count">
              <StageSwap before={3} after={4} />
            </span>
          </div>
          <div className="scrum-board__slot" />
          <MiniTask taskKey="GT-7" title="Login page" points={2} />
          <MiniTask taskKey="GT-8" title="Team channels" points={3} />
        </div>
        <MiniTask className="scrum-mini--mover" taskKey="GT-12" title="Roster API" points={3} />
      </div>
    </StageCard>

    <StageCard className="scrum-task-card stage-card--mobile" order={1}>
      <div className="scrum-task__top">
        <span className="scrum-task__key">GT-12</span>
        <span className="scrum-task__story">GT-4</span>
        <span className="scrum-task__estimate">
          <Clock size={11} strokeWidth={2.5} />
          6h
        </span>
        <span className="scrum-task__points">3</span>
      </div>
      <p className="scrum-task__title">Connect the class roster API</p>
      <div className="scrum-task__tags">
        <span className="stage-pill stage-pill--green">backend</span>
        <span className="stage-pill stage-pill--blue">frontend</span>
      </div>
      <div className="scrum-task__foot">
        <span className="scrum-task__pair">
          <span className="stage-avatar stage-avatar--purple">PS</span>
          <ArrowRight size={10} strokeWidth={2.5} />
          <span className="stage-avatar stage-avatar--blue">JL</span>
        </span>
        <span className="scrum-task__meta">
          <span className="scrum-task__comments">
            <MessageSquare size={11} strokeWidth={2.5} />4
          </span>
          <span className="scrum-task__pr">
            <GitMerge size={10} strokeWidth={2.5} />
            #41 merged
          </span>
        </span>
      </div>
      <div className="scrum-task__audit">
        <Repeat2 size={11} strokeWidth={2.5} />
        Moved to <b>Done</b> · Jordan · just now
      </div>
    </StageCard>

    <StageCard className="scrum-burnup-card stage-card--wide-only" order={2}>
      <div className="stage-card__head">
        <span className="stage-card__title">Sprint burnup</span>
        <span className="scrum-burnup__stat">
          <strong>18</strong>/24 pts
        </span>
      </div>
      <svg className="scrum-burnup__plot" viewBox="0 0 200 86" preserveAspectRatio="none">
        <line className="scrum-burnup__grid" x1="0" x2="200" y1="21" y2="21" />
        <line className="scrum-burnup__grid" x1="0" x2="200" y1="43" y2="43" />
        <line className="scrum-burnup__grid" x1="0" x2="200" y1="64" y2="64" />
        <polygon
          className="scrum-burnup__area"
          points="0,86 0,78 33,70 66,58 100,44 133,36 166,28 166,86"
        />
        <polyline className="scrum-burnup__scope" points="0,26 66,26 66,14 200,14" />
        <polyline className="scrum-burnup__done" points="0,78 33,70 66,58 100,44 133,36 166,28" />
      </svg>
      <div className="scrum-burnup__legend">
        <span>
          <i className="scrum-burnup__swatch--done" />
          Completed
        </span>
        <span>
          <i className="scrum-burnup__swatch--scope" />
          Scope
        </span>
      </div>
    </StageCard>
  </Spotlight>
);

export default ScrumSpotlight;
