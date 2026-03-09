import { useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { User } from 'lucide-react';
import type { TeamMember, FeedbackEntry } from './tsrsTypes';
import './TeamFeedbackTab.scss';

type FieldKey = `${string}-contribution` | `${string}-improvement`;

function formatMemberRole(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (normalized === 'product owner') return 'Product Owner';
  if (normalized === 'scrum master') return 'Scrum Master';
  if (normalized === 'member') return 'Member';
  return role;
}

export interface TeamFeedbackTabHandle {
  /** Returns true if all fields are valid (caller may navigate). If invalid, shows errors, scrolls to first, returns false. */
  validateForNavigation: () => boolean;
  /** Returns true if all fields are valid, without showing errors or scrolling. */
  checkIsValid: () => boolean;
}

interface TeamFeedbackTabProps {
  members: TeamMember[];
  feedback: Record<string, FeedbackEntry>;
  onFeedbackChange: (f: Record<string, FeedbackEntry>) => void;
  onValidationSuccess?: () => void;
  onFieldChange?: () => void;
  onBack: () => void;
  onNext: () => void;
  isFinalStep: boolean;
}

const TeamFeedbackTab = forwardRef<TeamFeedbackTabHandle, TeamFeedbackTabProps>(function TeamFeedbackTab(
  { members, feedback, onFeedbackChange, onValidationSuccess, onFieldChange, onBack, onNext, isFinalStep },
  ref,
) {
  const fieldRefs = useRef<Record<FieldKey, HTMLTextAreaElement | null>>({} as Record<FieldKey, HTMLTextAreaElement | null>);
  const [invalidFields, setInvalidFields] = useState<Set<FieldKey>>(new Set());

  const checkIsValid = useCallback((): boolean => {
    for (const member of members) {
      const c = (feedback[member.id]?.contribution ?? '').trim();
      const i = (feedback[member.id]?.improvement ?? '').trim();
      if (!c || !i) return false;
    }
    return true;
  }, [members, feedback]);

  const runValidation = useCallback((): boolean => {
    const emptyKeys: FieldKey[] = [];
    for (const member of members) {
      const c = (feedback[member.id]?.contribution ?? '').trim();
      const i = (feedback[member.id]?.improvement ?? '').trim();
      if (!c) emptyKeys.push(`${member.id}-contribution` as FieldKey);
      if (!i) emptyKeys.push(`${member.id}-improvement` as FieldKey);
    }
    if (emptyKeys.length > 0) {
      setInvalidFields(new Set(emptyKeys));
      const firstKey = emptyKeys[0];
      const el = fieldRefs.current[firstKey];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          el.focus();
        }, 500);
      }
      return false;
    }
    setInvalidFields(new Set());
    return true;
  }, [members, feedback]);

  useImperativeHandle(ref, () => ({
    validateForNavigation: runValidation,
    checkIsValid,
  }), [runValidation, checkIsValid]);

  const updateField = useCallback(
    (memberId: string, field: keyof FeedbackEntry, value: string) => {
      onFeedbackChange({
        ...feedback,
        [memberId]: { ...feedback[memberId], [field]: value },
      });
      onFieldChange?.();
      const key: FieldKey = field === 'contribution' ? `${memberId}-contribution` : `${memberId}-improvement`;
      setInvalidFields((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [feedback, onFeedbackChange, onFieldChange],
  );

  const handleNext = () => {
    if (!runValidation()) return;
    onValidationSuccess?.();
    onNext();
  };

  return (
    <div className="team-feedback-tab">
      <div className="team-feedback-tab__card">
        <div className="team-feedback-tab__card-header">
          <h3 className="team-feedback-tab__title">Provide Team Feedback</h3>
          <p className="team-feedback-tab__subtitle">
            Share constructive feedback for each team member (including yourself).
          </p>
        </div>

        <div className="team-feedback-tab__members">
          {members.map((member, idx, arr) => {
            const contributionKey: FieldKey = `${member.id}-contribution`;
            const improvementKey: FieldKey = `${member.id}-improvement`;
            return (
              <div
                key={member.id}
                className={`team-feedback-tab__member${idx < arr.length - 1 ? ' team-feedback-tab__member--divider' : ''}`}
              >
                <div className="team-feedback-tab__member-info">
                  <div className="team-feedback-tab__avatar">
                    <User size={20} />
                  </div>
                  <div>
                    <div className="team-feedback-tab__member-name">
                      {member.name}
                      {member.isCurrentUser && (
                        <span className="team-feedback-tab__you-label"> (You)</span>
                      )}
                    </div>
                    <div className="team-feedback-tab__member-role">{formatMemberRole(member.role)}</div>
                  </div>
                </div>

                <div className="team-feedback-tab__questions">
                  <div className="team-feedback-tab__question">
                    <label className="team-feedback-tab__label">
                      How has this person contributed to the team this week?
                    </label>
                    <textarea
                      ref={(el) => {
                        fieldRefs.current[contributionKey] = el;
                      }}
                      className={`team-feedback-tab__textarea${invalidFields.has(contributionKey) ? ' team-feedback-tab__textarea--error' : ''}`}
                      placeholder="Describe their contributions, completed tasks, and impact on the team..."
                      rows={3}
                      value={feedback[member.id]?.contribution ?? ''}
                      onChange={(e) => updateField(member.id, 'contribution', e.target.value)}
                    />
                  </div>
                  <div className="team-feedback-tab__question">
                    <label className="team-feedback-tab__label">
                      What is one thing this person can improve for next week?
                    </label>
                    <textarea
                      ref={(el) => {
                        fieldRefs.current[improvementKey] = el;
                      }}
                      className={`team-feedback-tab__textarea${invalidFields.has(improvementKey) ? ' team-feedback-tab__textarea--error' : ''}`}
                      placeholder="Provide constructive feedback on areas for growth or improvement..."
                      rows={3}
                      value={feedback[member.id]?.improvement ?? ''}
                      onChange={(e) => updateField(member.id, 'improvement', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="team-feedback-tab__footer">
        <button type="button" className="tsrs-btn tsrs-btn--secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="tsrs-btn tsrs-btn--primary" onClick={handleNext}>
          {isFinalStep ? 'Submit' : 'Next'}
        </button>
      </div>
    </div>
  );
});

export default TeamFeedbackTab;
