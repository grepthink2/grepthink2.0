import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ApiTSR } from '@/lib/api';
import { useUser } from '@/lib/auth';
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

/** Parse a week number from an assignment name, e.g. "TSR Week 3" → 3. */
function parseWeekFromName(name: string): number {
  const match = name.match(/week\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * From a list of TSRs for this assignment, build a map of
 * evaluatee_id → the most recently submitted TSR.
 */
function buildLatestByEvaluatee(tsrs: ApiTSR[]): Record<string, ApiTSR> {
  const map: Record<string, ApiTSR> = {};
  for (const tsr of tsrs) {
    const eid = tsr.evaluatee_id;
    if (!eid) continue;
    if (!map[eid] || (tsr.created_at ?? '') > (map[eid].created_at ?? '')) {
      map[eid] = tsr;
    }
  }
  return map;
}

interface TSRSProps {
  assignment: TsrsAssignment;
}

const TSRS: React.FC<TSRSProps> = ({ assignment }) => {
  const navigate = useNavigate();
  const { user } = useUser();

  // ── Member loading ──────────────────────────────────────────
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  // ── Prior-submission loading (for edit pre-fill) ─────────
  const [priorTsrs, setPriorTsrs] = useState<ApiTSR[]>([]);
  const [tsrsLoading, setTsrsLoading] = useState(true);

  // ── Form initialisation ──────────────────────────────────
  const [membersInitialized, setMembersInitialized] = useState(false);
  /** True when the form was pre-filled from an existing submission. */
  const [isEditMode, setIsEditMode] = useState(false);

  const isLoading = membersLoading || tsrsLoading;

  // Kick off both fetches in parallel when the projectId is known.
  useEffect(() => {
    if (!assignment.projectId) {
      setMembersLoading(false);
      setTsrsLoading(false);
      return;
    }

    let cancelled = false;

    // Fetch project members
    setMembersLoading(true);
    setMembersError(null);
    api.getProjectMembers(assignment.projectId)
      .then(({ members: apiMembers }) => {
        if (cancelled) return;
        const teamMembers: TeamMember[] = apiMembers.map((m) => ({
          id: m.user_id,
          name: m.email ?? m.user_id,
          role: m.project_role,
          isCurrentUser: m.user_id === user?.id,
          isScrumMaster: m.project_role === 'scrum master',
        }));
        setMembers(teamMembers);
      })
      .catch((e) => {
        if (!cancelled) {
          setMembersError(e instanceof Error ? e.message : 'Failed to load team members');
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });

    // Fetch this student's prior TSRs for the project, filter to this assignment
    setTsrsLoading(true);
    api.getProjectTsrs(assignment.projectId)
      .then(({ tsrs }) => {
        if (cancelled) return;
        const relevant = tsrs.filter((t) => t.assignment_id === assignment.id);
        setPriorTsrs(relevant);
      })
      .catch(() => {
        if (!cancelled) setPriorTsrs([]);
      })
      .finally(() => {
        if (!cancelled) setTsrsLoading(false);
      });

    return () => { cancelled = true; };
  }, [assignment.projectId, assignment.id, user?.id]);

  // ── Form state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TsrsTab>('contributions');
  const [completedSteps, setCompletedSteps] = useState<Set<TsrsTab>>(new Set());
  const [contributions, setContributions] = useState<ContributionMap>({});
  const [feedback, setFeedback] = useState<Record<string, FeedbackEntry>>({});
  const [scrumData, setScrumData] = useState<Record<string, ScrumMasterEntry>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingTeamFeedbackValidationOnSubmit, setPendingTeamFeedbackValidationOnSubmit] =
    useState(false);
  const [contributionsError, setContributionsError] = useState<string | null>(null);
  const teamFeedbackTabRef = useRef<TeamFeedbackTabHandle>(null);

  // Once both members and prior TSRs are loaded, initialise the form.
  // If prior TSRs exist for this assignment, pre-fill from the latest ones.
  useEffect(() => {
    if (membersInitialized || membersLoading || tsrsLoading || members.length === 0) return;

    const latestByEvaluatee = buildLatestByEvaluatee(priorTsrs);
    const hasPrior = Object.keys(latestByEvaluatee).length > 0;

    setContributions(
      Object.fromEntries(
        members.map((m) => [
          m.id,
          latestByEvaluatee[m.id]?.percent_contribution ?? Math.floor(100 / members.length),
        ]),
      ),
    );

    setFeedback(
      Object.fromEntries(
        members.map((m) => [
          m.id,
          {
            contribution: latestByEvaluatee[m.id]?.positive_feedback ?? '',
            improvement:  latestByEvaluatee[m.id]?.constructive_feedback ?? '',
          },
        ]),
      ),
    );

    setScrumData(
      Object.fromEntries(
        members.map((m) => [
          m.id,
          {
            tickets:    '',
            assessment: '',
            notes:      latestByEvaluatee[m.id]?.scrum_master_notes ?? '',
          },
        ]),
      ),
    );

    setMembersInitialized(true);
    if (hasPrior) setIsEditMode(true);
  }, [members, membersLoading, tsrsLoading, membersInitialized, priorTsrs]);

  const currentUser   = members.find((m) => m.isCurrentUser);
  const isScrumMaster = currentUser?.isScrumMaster ?? false;

  const contributionsTotal = Object.values(contributions).reduce((s, v) => s + v, 0);

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

  const validateAndNavigate = (target: TsrsTab) => {
    const steps: TsrsTab[] = isScrumMaster
      ? ['contributions', 'team_feedback', 'scrum_master']
      : ['contributions', 'team_feedback'];
    const currentIndex = steps.indexOf(activeTab);
    const targetIndex  = steps.indexOf(target);

    if (activeTab === 'contributions' && targetIndex > currentIndex) {
      if (contributionsTotal !== 100) {
        setContributionsError('Team contributions must add up to exactly 100%.');
        return;
      }
      setCompletedSteps((prev) => new Set([...prev, 'contributions']));
    }

    if (activeTab === 'team_feedback' && targetIndex > currentIndex) {
      if (teamFeedbackTabRef.current?.validateForNavigation() === false) return;
      setCompletedSteps((prev) => new Set([...prev, 'team_feedback']));
    }

    setContributionsError(null);
    setActiveTab(target);
  };

  const handleSubmit = async () => {
    if (isScrumMaster && !completedSteps.has('team_feedback')) {
      setActiveTab('team_feedback');
      setPendingTeamFeedbackValidationOnSubmit(true);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const week = parseWeekFromName(assignment.name);
      await Promise.all(
        members.map((member) =>
          api.createProjectTsr(assignment.projectId, {
            evaluatee_id:           member.id,
            percent_contribution:   contributions[member.id] ?? 0,
            positive_feedback:      feedback[member.id]?.contribution ?? '',
            constructive_feedback:  feedback[member.id]?.improvement  ?? '',
            scrum_master_notes:     isScrumMaster ? (scrumData[member.id]?.notes ?? '') : '',
            assignment_id:          assignment.id,
            week,
          }),
        ),
      );
      setSubmitted(true);
      setIsEditMode(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'team_feedback' && pendingTeamFeedbackValidationOnSubmit) {
      teamFeedbackTabRef.current?.validateForNavigation();
      setPendingTeamFeedbackValidationOnSubmit(false);
    }
  }, [activeTab, pendingTeamFeedbackValidationOnSubmit]);

  // ── Loading / error states ───────────────────────────────────
  if (isLoading) {
    return (
      <div className="tsrs tsrs--loading">
        <p>{membersLoading ? 'Loading team members…' : 'Loading your previous submission…'}</p>
      </div>
    );
  }

  if (membersError) {
    return (
      <div className="tsrs tsrs--error">
        <p className="tsrs__error-message">{membersError}</p>
      </div>
    );
  }

  if (!assignment.projectId) {
    return (
      <div className="tsrs tsrs--error">
        <p className="tsrs__error-message">
          No project associated with this assignment. Please navigate here from your Assignments
          page.
        </p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="tsrs tsrs--error">
        <p className="tsrs__error-message">No team members found for this project.</p>
      </div>
    );
  }

  // ── Submitted confirmation ───────────────────────────────────
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

  // ── Form ─────────────────────────────────────────────────────
  return (
    <div className="tsrs">
      {isEditMode && (
        <div className="tsrs__edit-banner">
          You are editing your previous submission. Changes will create a new submission.
        </div>
      )}

      <TsrsStepper
        activeTab={activeTab}
        completedSteps={completedSteps}
        onTabClick={validateAndNavigate}
        showScrumMaster={isScrumMaster}
      />

      <div className="tsrs__body">
        {activeTab === 'contributions' && (
          <ContributionsTab
            members={members}
            contributions={contributions}
            onContributionChange={handleContributionChange}
            onNext={() => validateAndNavigate('team_feedback')}
            error={contributionsError}
          />
        )}

        {activeTab === 'team_feedback' && (
          <TeamFeedbackTab
            ref={teamFeedbackTabRef}
            members={members}
            feedback={feedback}
            onFeedbackChange={setFeedback}
            onValidationSuccess={() =>
              setCompletedSteps((prev) => new Set([...prev, 'team_feedback']))
            }
            onFieldChange={() =>
              setCompletedSteps((prev) => {
                const next = new Set(prev);
                next.delete('team_feedback');
                return next;
              })
            }
            onBack={() => setActiveTab('contributions')}
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
            members={members}
            data={scrumData}
            onDataChange={setScrumData}
            onFieldChange={() =>
              setCompletedSteps((prev) => {
                const next = new Set(prev);
                next.delete('scrum_master');
                return next;
              })
            }
            onBack={() => setActiveTab('team_feedback')}
            onSubmit={handleSubmit}
          />
        )}
      </div>

      {submitError && <p className="tsrs__submit-error">{submitError}</p>}

      {isSubmitting && (
        <div className="tsrs__submitting-overlay">
          <p>{isEditMode ? 'Resubmitting…' : 'Submitting…'}</p>
        </div>
      )}
    </div>
  );
};

export default TSRS;
