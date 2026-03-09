import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TsrsStepper from './TsrsStepper';
import ContributionsTab from './ContributionsTab';
import TeamFeedbackTab from './TeamFeedbackTab';
import type { TeamFeedbackTabHandle } from './TeamFeedbackTab';
import ScrumMasterTab from './ScrumMasterTab';
import type {
  TsrsTab,
  TeamMember,
  TsrsAssignment,
  ContributionMap,
  FeedbackEntry,
  ScrumMasterEntry,
} from './tsrsTypes';
import './TSRS.scss';

export type { TsrsAssignment };

// ── Mock data (replace with API call once endpoint is ready) ─────
const MOCK_MEMBERS: TeamMember[] = [
  { id: '1', name: 'Sarah Chen',        role: 'Product Owner',      isCurrentUser: false, isScrumMaster: false },
  { id: '2', name: 'Michael Rodriguez', role: 'Scrum Master',       isCurrentUser: true,  isScrumMaster: true  },
  { id: '3', name: 'Emily Johnson',     role: 'Frontend Developer', isCurrentUser: false, isScrumMaster: false },
  { id: '4', name: 'David Kim',         role: 'Backend Developer',  isCurrentUser: false, isScrumMaster: false },
];

interface TSRSProps {
  assignment: TsrsAssignment;
}

const TSRS: React.FC<TSRSProps> = ({ assignment }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TsrsTab>('contributions');
  const [completedSteps, setCompletedSteps] = useState<Set<TsrsTab>>(new Set());

  const initialContributions: ContributionMap = Object.fromEntries(
    MOCK_MEMBERS.map((m) => [m.id, Math.floor(100 / MOCK_MEMBERS.length)])
  );

  const initialFeedback: Record<string, FeedbackEntry> = Object.fromEntries(
    MOCK_MEMBERS.map((m) => [m.id, { contribution: '', improvement: '' }])
  );

  const initialScrumData: Record<string, ScrumMasterEntry> = Object.fromEntries(
    MOCK_MEMBERS.map((m) => [m.id, { tickets: '', assessment: '', notes: '' }])
  );

  const [contributions, setContributions] = useState<ContributionMap>(initialContributions);
  const [feedback, setFeedback] = useState<Record<string, FeedbackEntry>>(initialFeedback);
  const [scrumData, setScrumData] = useState<Record<string, ScrumMasterEntry>>(initialScrumData);
  const [submitted, setSubmitted] = useState(false);
  const [pendingTeamFeedbackValidationOnSubmit, setPendingTeamFeedbackValidationOnSubmit] =
    useState(false);
  const [contributionsError, setContributionsError] = useState<string | null>(null);
  const teamFeedbackTabRef = useRef<TeamFeedbackTabHandle>(null);

  const currentUser = MOCK_MEMBERS.find((m) => m.isCurrentUser);
  const isScrumMaster = currentUser?.isScrumMaster ?? false;

  const contributionsTotal = Object.values(contributions).reduce((s, v) => s + v, 0);

  // Check validity whenever activeTab changes or data changes
  useEffect(() => {
    if (activeTab === 'contributions') {
      if (contributionsTotal === 100) {
        setCompletedSteps((prev) => new Set([...prev, 'contributions']));
      }
    } else if (activeTab === 'team_feedback') {
      if (teamFeedbackTabRef.current?.checkIsValid()) {
        setCompletedSteps((prev) => new Set([...prev, 'team_feedback']));
      }
    }
  }, [activeTab, contributionsTotal, feedback]);

  const handleContributionChange = (c: ContributionMap) => {
    setContributions(c);
    setContributionsError(null);
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete('contributions');
      return next;
    });
  };

  /** Validate step data before allowing forward navigation (from Next button or stepper click). */
  const validateAndNavigate = (target: TsrsTab) => {
    const steps: TsrsTab[] = isScrumMaster
      ? ['contributions', 'team_feedback', 'scrum_master']
      : ['contributions', 'team_feedback'];
    const currentIndex = steps.indexOf(activeTab);
    const targetIndex = steps.indexOf(target);

    if (activeTab === 'contributions' && targetIndex > currentIndex) {
      if (contributionsTotal !== 100) {
        setContributionsError('Team contributions must add up to exactly 100%.');
        return;
      }
      setCompletedSteps((prev) => new Set([...prev, 'contributions']));
    }

    if (activeTab === 'team_feedback' && targetIndex > currentIndex) {
      if (teamFeedbackTabRef.current?.validateForNavigation() === false) {
        return;
      }
      setCompletedSteps((prev) => new Set([...prev, 'team_feedback']));
    }

    setContributionsError(null);
    setActiveTab(target);
  };

  const handleSubmit = () => {
    // For Scrum Masters, require that Team Feedback is completed (i.e. visited and validated)
    // before allowing final submission. If it's not, send them to the Team Feedback tab instead.
    if (isScrumMaster && !completedSteps.has('team_feedback')) {
      setActiveTab('team_feedback');
      setPendingTeamFeedbackValidationOnSubmit(true);
      return;
    }

    // TODO: replace with API call once the endpoint is ready
    console.log('TSRS Submission for assignment', assignment.id, {
      contributions,
      feedback,
      ...(isScrumMaster ? { scrumData } : {}),
    });
    setSubmitted(true);
  };

  // When we've navigated back to the Team Feedback tab due to a failed submit,
  // trigger full validation so the user sees red errors and scroll-to-first-empty.
  useEffect(() => {
    if (activeTab === 'team_feedback' && pendingTeamFeedbackValidationOnSubmit) {
      if (teamFeedbackTabRef.current) {
        teamFeedbackTabRef.current.validateForNavigation();
      }
      setPendingTeamFeedbackValidationOnSubmit(false);
    }
  }, [activeTab, pendingTeamFeedbackValidationOnSubmit]);

  if (submitted) {
    return (
      <div className="tsrs__submitted">
        <div className="tsrs__submitted-icon">✓</div>
        <h3 className="tsrs__submitted-title">Submission Received</h3>
        <p className="tsrs__submitted-sub">
          Your team status report for <strong>{assignment.name}</strong> has been submitted.
        </p>
        <div className="tsrs__submitted-actions">
          <button
            type="button"
            className="tsrs-btn tsrs-btn--secondary"
            onClick={() => setSubmitted(false)}
          >
            Edit submission
          </button>
          <button
            type="button"
            className="tsrs-btn tsrs-btn--primary"
            onClick={() => navigate('/app/assignments')}
          >
            Back to assignments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tsrs">
      <TsrsStepper
        activeTab={activeTab}
        completedSteps={completedSteps}
        onTabClick={validateAndNavigate}
        showScrumMaster={isScrumMaster}
      />

      <div className="tsrs__body">
        {activeTab === 'contributions' && (
          <ContributionsTab
            members={MOCK_MEMBERS}
            contributions={contributions}
            onContributionChange={handleContributionChange}
            onNext={() => validateAndNavigate('team_feedback')}
            error={contributionsError}
          />
        )}

        {activeTab === 'team_feedback' && (
          <TeamFeedbackTab
            ref={teamFeedbackTabRef}
            members={MOCK_MEMBERS}
            feedback={feedback}
            onFeedbackChange={setFeedback}
            onValidationSuccess={() => setCompletedSteps((prev) => new Set([...prev, 'team_feedback']))}
            onFieldChange={() => setCompletedSteps((prev) => {
              const next = new Set(prev);
              next.delete('team_feedback');
              return next;
            })}
            onBack={() => {
              setActiveTab('contributions');
            }}
            onNext={() => {
              if (isScrumMaster) {
                setActiveTab('scrum_master');
              } else {
                handleSubmit();
              }
            }}
            isFinalStep={!isScrumMaster}
          />
        )}

        {activeTab === 'scrum_master' && isScrumMaster && (
          <ScrumMasterTab
            members={MOCK_MEMBERS}
            data={scrumData}
            onDataChange={setScrumData}
            onFieldChange={() => setCompletedSteps((prev) => {
              const next = new Set(prev);
              next.delete('scrum_master');
              return next;
            })}
            onBack={() => {
              setActiveTab('team_feedback');
            }}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
};

export default TSRS;
