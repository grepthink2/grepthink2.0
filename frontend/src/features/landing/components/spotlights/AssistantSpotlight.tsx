import React from 'react';
import { Check, CircleAlert, Clock, GitPullRequest, ShieldCheck, Sparkles } from 'lucide-react';
import { BAND_BADGES, SECTION_IDS } from '../../landing.config';
import Spotlight, { type SpotlightPoint } from './Spotlight';
import StageCard from './StageCard';
import StageSwap from './StageSwap';
import './AssistantSpotlight.scss';

const POINTS: SpotlightPoint[] = [
  { icon: GitPullRequest, text: 'Suggests board moves from merged PRs and commits' },
  { icon: Clock, text: 'Flags stalled tasks and PRs with no task' },
  { icon: ShieldCheck, text: 'Proposes changes, never makes them on its own' },
];

const AssistantSpotlight: React.FC = () => (
  <Spotlight
    id={SECTION_IDS.assistant}
    label="Project assistant"
    badge={BAND_BADGES.assistant}
    title="A board that keeps up with"
    accent="your code"
    lead="The assistant will read your pull requests and commits and suggest the board updates they imply: move a task to Done when its PR merges, flag work that has stalled, link PRs that aren't on the board. Nothing changes until someone on the team approves it."
    points={POINTS}
    textSide="left"
    stage="preview"
    aside={{
      title: 'For TAs and instructors',
      text: "Each week it compares status reports with the tasks and PRs each student actually closed, and points out where they don't line up, so reviews start from evidence.",
    }}
    cta={{ label: 'Want early access? Get in touch', to: '/contact' }}
  >
    <StageCard className="assist-stall-card stage-card--wide-only" order={0}>
      <span className="assist-flag">
        <i />
        Stalled
      </span>
      <p className="assist-stall__title">
        <code>GT-9</code>Attendance tab
      </p>
      <p className="assist-stall__detail">In Progress for 6 days · no commits</p>
      <span className="assist-link">Nudge Sam →</span>
    </StageCard>

    <StageCard className="assist-suggest-card stage-card--mobile" order={1}>
      <div className="stage-card__head">
        <span className="stage-card__title">
          <span className="assist-mark">
            <Sparkles size={14} strokeWidth={2} />
          </span>
          Project assistant
        </span>
        <span className="stage-card__meta">just now</span>
      </div>
      <p className="assist-suggest__text">
        PR <b>#41</b> was merged into main. Move this task to Done?
      </p>
      <div className="assist-task">
        <code>GT-12</code>
        Connect the class roster API
        <StageSwap className="assist-task__target" before="→ Done" after="Moved to Done" />
      </div>
      <div className="assist-actions">
        <StageSwap
          before={<span className="assist-btn assist-btn--primary">Approve</span>}
          after={
            <span className="assist-btn assist-btn--done">
              <Check size={12} strokeWidth={2.75} />
              Approved
            </span>
          }
        />
        <span className="assist-btn assist-btn--ghost">Dismiss</span>
      </div>
    </StageCard>

    <StageCard className="assist-report-card" order={2}>
      <div className="stage-card__head">
        <span className="stage-card__title">Week 5 status reports</span>
        <span className="stage-card__meta">ShoeShopper</span>
      </div>
      <div className="assist-report__row">
        <span className="assist-check assist-check--ok">
          <Check size={11} strokeWidth={3} />
        </span>
        4 reports match closed work
      </div>
      <div className="assist-report__row">
        <span className="assist-check assist-check--warn">
          <CircleAlert size={11} strokeWidth={2.75} />
        </span>
        Alex: reports 35%, closed 1 of 6 tasks
        <span className="stage-pill stage-pill--amber assist-report__review">Review</span>
      </div>
    </StageCard>

    <StageCard className="assist-chip-card stage-card--wide-only" order={3}>
      <GitPullRequest size={12} strokeWidth={2.5} className="assist-chip__icon" />
      <b>PR #44</b> isn&apos;t on the board · <span className="assist-link">Add task</span>
    </StageCard>
  </Spotlight>
);

export default AssistantSpotlight;
