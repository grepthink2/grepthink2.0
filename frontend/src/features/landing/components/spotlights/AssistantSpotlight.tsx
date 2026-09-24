import React from 'react';
import { Clock, GitPullRequest, ShieldCheck } from 'lucide-react';
import { AssistantSuggestionCard } from '@features/app/components/Assistant/AssistantSuggestionCard';
import {
  ReportCheckCard,
  type ReportCheckRow,
} from '@features/app/components/Assistant/ReportCheckCard';
import { StalledFlag } from '@features/app/components/Assistant/StalledFlag';
import { UnlinkedPRChip } from '@features/app/components/Assistant/UnlinkedPRChip';
import { BAND_BADGES, SECTION_IDS } from '../../landing.config';
import Spotlight, { type SpotlightPoint } from './Spotlight';
import StageCard from './StageCard';
import './AssistantSpotlight.scss';

const POINTS: SpotlightPoint[] = [
  { icon: GitPullRequest, text: 'Suggests board moves from merged PRs and commits' },
  { icon: Clock, text: 'Flags stalled tasks and PRs with no task' },
  { icon: ShieldCheck, text: 'Proposes changes, never makes them on its own' },
];

const REPORT_ROWS: ReportCheckRow[] = [
  { text: '4 reports match closed work' },
  { kind: 'review', text: 'Alex: reports 35%, closed 1 of 6 tasks' },
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
    <StageCard className="assist-suggest-card stage-card--mobile" order={0}>
      {/* The moment: Approve presses, then the card folds to its approved state. */}
      <div className="assist-moment">
        <AssistantSuggestionCard
          surface="landing"
          className="assist-moment__approved"
          state="approved"
          taskKey="GT-12"
        />
        <AssistantSuggestionCard
          surface="landing"
          className="assist-moment__pending"
          evidence={
            <>
              PR <b>#41</b> was merged into main.
            </>
          }
          taskKey="GT-12"
          taskTitle="Connect the class roster API"
        />
      </div>
    </StageCard>

    <StageCard className="assist-stall-card stage-card--wide-only" order={1}>
      <StalledFlag surface="landing" taskKey="GT-9" title="Attendance tab" assignee="Sam" />
    </StageCard>

    <StageCard className="assist-report-card" order={2}>
      <ReportCheckCard surface="landing" project="ShoeShopper" rows={REPORT_ROWS} />
    </StageCard>

    <StageCard className="assist-chip-card stage-card--wide-only" order={3}>
      <UnlinkedPRChip surface="bare" />
    </StageCard>
  </Spotlight>
);

export default AssistantSpotlight;
