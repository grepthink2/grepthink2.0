import { useRef, useState, useCallback } from 'react';
import { User } from 'lucide-react';
import type { TeamMember, ScrumMasterEntry } from './tsrsTypes';
import './ScrumMasterTab.scss';

/** Required fields only; notes are optional. */
type RequiredFieldKey = `${string}-tickets` | `${string}-assessment`;

interface ScrumMasterTabProps {
  members: TeamMember[];
  data: Record<string, ScrumMasterEntry>;
  onDataChange: (d: Record<string, ScrumMasterEntry>) => void;
  onFieldChange?: () => void;
  onBack: () => void;
  onSubmit: () => void;
}

const ScrumMasterTab: React.FC<ScrumMasterTabProps> = ({
  members,
  data,
  onDataChange,
  onFieldChange,
  onBack,
  onSubmit,
}) => {
  const fieldRefs = useRef<Record<RequiredFieldKey, HTMLTextAreaElement | null>>(
    {} as Record<RequiredFieldKey, HTMLTextAreaElement | null>,
  );
  const [invalidFields, setInvalidFields] = useState<Set<RequiredFieldKey>>(new Set());

  const updateField = useCallback(
    (memberId: string, field: keyof ScrumMasterEntry, value: string) => {
      onDataChange({
        ...data,
        [memberId]: { ...data[memberId], [field]: value },
      });
      if (field === 'tickets' || field === 'assessment') {
        onFieldChange?.();
        const key: RequiredFieldKey = `${memberId}-${field}`;
        setInvalidFields((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [data, onDataChange, onFieldChange],
  );

  const runValidation = useCallback((): boolean => {
    const emptyKeys: RequiredFieldKey[] = [];
    for (const member of members) {
      const tickets = (data[member.id]?.tickets ?? '').trim();
      const assessment = (data[member.id]?.assessment ?? '').trim();
      if (!tickets) emptyKeys.push(`${member.id}-tickets` as RequiredFieldKey);
      if (!assessment) emptyKeys.push(`${member.id}-assessment` as RequiredFieldKey);
    }
    if (emptyKeys.length > 0) {
      setInvalidFields(new Set(emptyKeys));
      const firstKey = emptyKeys[0];
      const el = fieldRefs.current[firstKey];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.focus(), 500);
      }
      return false;
    }
    setInvalidFields(new Set());
    return true;
  }, [members, data]);

  const handleSubmit = () => {
    if (!runValidation()) return;
    onSubmit();
  };

  return (
    <div className="scrum-master-tab">
      <div className="scrum-master-tab__card">
        <div className="scrum-master-tab__card-header">
          <span className="scrum-master-tab__badge">SCRUM MASTER ONLY</span>
          <h3 className="scrum-master-tab__title">Performance Documentation</h3>
          <p className="scrum-master-tab__subtitle">
            Document each team member's work items, performance evidence, and notes.
          </p>
        </div>

        <div className="scrum-master-tab__members">
          {members.map((member, idx, arr) => {
            const ticketsKey: RequiredFieldKey = `${member.id}-tickets`;
            const assessmentKey: RequiredFieldKey = `${member.id}-assessment`;
            return (
              <div
                key={member.id}
                className={`scrum-master-tab__member${idx < arr.length - 1 ? ' scrum-master-tab__member--divider' : ''}`}
              >
                <div className="scrum-master-tab__member-info">
                  <div className="scrum-master-tab__avatar">
                    <User size={20} />
                  </div>
                  <div>
                    <div className="scrum-master-tab__member-name">
                      {member.name}
                      {member.isCurrentUser && (
                        <span className="scrum-master-tab__you-label"> (You)</span>
                      )}
                    </div>
                    <div className="scrum-master-tab__member-role">{member.role}</div>
                  </div>
                </div>

                <div className="scrum-master-tab__fields">
                  <div className="scrum-master-tab__field">
                    <label className="scrum-master-tab__label">
                      Stories and Tickets Worked On
                    </label>
                    <textarea
                      ref={(el) => {
                        fieldRefs.current[ticketsKey] = el;
                      }}
                      className={`scrum-master-tab__textarea${invalidFields.has(ticketsKey) ? ' scrum-master-tab__textarea--error' : ''}`}
                      placeholder="List user stories, tickets, or tasks (e.g., JIRA-123, JIRA-456)..."
                      rows={3}
                      value={data[member.id]?.tickets ?? ''}
                      onChange={(e) => updateField(member.id, 'tickets', e.target.value)}
                    />
                  </div>

                  <div className="scrum-master-tab__field">
                    <label className="scrum-master-tab__label">
                      Performance Assessment &amp; Evidence
                    </label>
                    <p className="scrum-master-tab__field-hint">
                      Include evidence such as pull request links, design documents, meeting notes, etc.
                    </p>
                    <textarea
                      ref={(el) => {
                        fieldRefs.current[assessmentKey] = el;
                      }}
                      className={`scrum-master-tab__textarea scrum-master-tab__textarea--mono${invalidFields.has(assessmentKey) ? ' scrum-master-tab__textarea--error' : ''}`}
                      placeholder={`Evidence of work completed:\n– PR #123: https://github.com/...\n– Design doc: https://docs.google.com/...\n– Meeting notes: https://...`}
                      rows={4}
                      value={data[member.id]?.assessment ?? ''}
                      onChange={(e) => updateField(member.id, 'assessment', e.target.value)}
                    />
                  </div>

                  <div className="scrum-master-tab__field">
                    <label className="scrum-master-tab__label">Notes/Comments (Optional)</label>
                    <textarea
                      className="scrum-master-tab__textarea"
                      placeholder="Additional notes, blockers, or observations..."
                      rows={3}
                      value={data[member.id]?.notes ?? ''}
                      onChange={(e) => updateField(member.id, 'notes', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="scrum-master-tab__footer">
        <button type="button" className="tsrs-btn tsrs-btn--secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="tsrs-btn tsrs-btn--primary" onClick={handleSubmit}>
          Submit
        </button>
      </div>
    </div>
  );
};

export default ScrumMasterTab;
