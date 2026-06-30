import React from 'react';
import { Clock, Video, Plus, Users, CircleCheck, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { getInitials } from '@features/app/utils/memberUtils';
import {
  ATTENDANCE_OPTIONS,
  STATUS_LABEL,
  formatMeeting,
  type AttendanceRow,
  type AttendanceStatus,
  type TeamMeetingItem,
} from './taTypes';
import './TeamMeetingCard.scss';

interface TaOption {
  id: string;
  name: string;
}

interface TeamMeetingCardProps {
  item: TeamMeetingItem;
  weekNumber: number;
  /** Which meeting in the week the check-in reflects; omitted when 1/week. */
  meetingInWeek?: number;
  /** Can edit Zoom + mark attendance (instructor or assigned TA). */
  editable: boolean;
  /** Can expand the inline check-in roster. */
  expandable: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  roster?: AttendanceRow[];
  rosterLoading?: boolean;
  /** Student view: show the student's own status instead of a team tally. */
  ownStatus?: AttendanceStatus;
  /** Instructor view: render an assign-TA dropdown in the ASSIGNED TA cell. */
  assignable?: boolean;
  taOptions?: TaOption[];
  onAssignTa?: (taId: string | null) => void;
  onAddZoom?: () => void;
  onMark?: (personId: string, status: 'present' | 'late' | 'absent') => void;
  onMarkAllPresent?: () => void;
}

/** Small circular initials avatar (self-contained; mirrors the app's avatar look). */
const Avatar: React.FC<{ name: string; email?: string | null; size: number }> = ({ name, email, size }) => (
  <span
    className="ta-card__avatar"
    style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    aria-hidden="true"
  >
    {getInitials(name || '', email || '')}
  </span>
);

const AttendanceToggle: React.FC<{
  value: AttendanceStatus;
  onChange?: (s: 'present' | 'late' | 'absent') => void;
}> = ({ value, onChange }) => (
  <div className="ta-toggle" role="group" aria-label="Attendance status">
    {ATTENDANCE_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        className={`ta-toggle__seg ta-toggle__seg--${opt.value} ${value === opt.value ? 'is-selected' : ''}`}
        aria-pressed={value === opt.value}
        onClick={() => onChange?.(opt.value)}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const TeamMeetingCard: React.FC<TeamMeetingCardProps> = ({
  item,
  weekNumber,
  meetingInWeek,
  editable,
  expandable,
  expanded = false,
  onToggleExpand,
  roster,
  rosterLoading,
  ownStatus,
  assignable = false,
  taOptions = [],
  onAssignTa,
  onAddZoom,
  onMark,
  onMarkAllPresent,
}) => {
  const meeting = formatMeeting(item.meetingDay, item.meetingTime);
  const hasZoom = !!item.zoomUrl;
  const isStudentView = ownStatus !== undefined;

  return (
    <div className={`ta-card ${expanded ? 'ta-card--expanded' : ''}`}>
      <div className="ta-card__header">
        <Avatar name={item.teamName} size={40} />
        <div className="ta-card__name-block">
          <span className="ta-card__name">{item.teamName}</span>
          <span className="ta-card__sub">
            {item.total} {item.total === 1 ? 'member' : 'members'}
          </span>
        </div>
        {hasZoom ? (
          <span className="ta-card__pill ta-card__pill--ok">Meets weekly</span>
        ) : (
          <span className="ta-card__pill ta-card__pill--warn">No Zoom link yet</span>
        )}
        {expandable && (
          <button
            type="button"
            className="ta-card__chevron"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Collapse' : 'Expand check-in'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      <div className="ta-card__meta">
        <div className="ta-card__col">
          <span className="ta-card__label">MEETING TIME</span>
          <span className="ta-card__value">
            <Clock size={16} className="ta-card__value-icon" />
            {meeting ?? <span className="ta-card__muted">Not scheduled</span>}
          </span>
        </div>

        <div className="ta-card__col">
          <span className="ta-card__label">ASSIGNED TA</span>
          {assignable ? (
            <select
              className="ta-card__ta-select"
              value={item.assignedTa?.id ?? ''}
              onChange={(e) => onAssignTa?.(e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {taOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : item.assignedTa ? (
            <span className="ta-card__value">
              <Avatar name={item.assignedTa.name} email={item.assignedTa.email} size={20} />
              {item.assignedTa.name}
            </span>
          ) : (
            <span className="ta-card__value ta-card__muted">
              <Minus size={16} className="ta-card__value-icon" />
              Unassigned
            </span>
          )}
        </div>

        <div className="ta-card__col">
          <span className="ta-card__label">{isStudentView ? 'YOUR STATUS' : 'ATTENDANCE'}</span>
          {isStudentView ? (
            <span className={`ta-card__value ta-card__own ta-card__own--${ownStatus}`}>
              {ownStatus === 'unmarked' ? 'Not marked yet' : `You: ${STATUS_LABEL[ownStatus]}`}
            </span>
          ) : item.total > 0 && (item.present > 0 || hasZoom) ? (
            <span className="ta-card__value">
              <CircleCheck size={16} className="ta-card__value-icon ta-card__value-icon--ok" />
              {item.present} / {item.total} present
            </span>
          ) : (
            <span className="ta-card__value ta-card__muted">
              <Minus size={16} className="ta-card__value-icon" />
              Not taken
            </span>
          )}
        </div>
      </div>

      <div className="ta-card__actions">
        {hasZoom ? (
          <a className="ta-card__btn ta-card__btn--join" href={item.zoomUrl!} target="_blank" rel="noreferrer">
            <Video size={16} /> Join Zoom
          </a>
        ) : editable ? (
          <button type="button" className="ta-card__btn ta-card__btn--add" onClick={onAddZoom}>
            <Plus size={16} /> Add Zoom link
          </button>
        ) : (
          <span className="ta-card__btn ta-card__btn--disabled">
            <Video size={16} /> Link not posted yet
          </span>
        )}
        {expandable && !expanded && (
          <button type="button" className="ta-card__btn ta-card__btn--checkin" onClick={onToggleExpand}>
            <Users size={16} /> Check-in
          </button>
        )}
      </div>

      {expanded && (
        <div className="ta-card__roster">
          <div className="ta-card__roster-head">
            <span className="ta-card__roster-title">
              Check-in · Week {weekNumber}{meetingInWeek ? ` · Meeting ${meetingInWeek}` : ''}
            </span>
            {editable && (
              <button type="button" className="ta-card__mark-all" onClick={onMarkAllPresent}>
                Mark all present
              </button>
            )}
          </div>
          {rosterLoading ? (
            <p className="ta-card__roster-empty">Loading roster…</p>
          ) : roster && roster.length > 0 ? (
            roster.map((r) => (
              <div className="ta-card__student" key={r.personId}>
                <Avatar name={r.name} email={r.email} size={24} />
                <span className="ta-card__student-name">{r.name}</span>
                {editable ? (
                  <AttendanceToggle value={r.status} onChange={(s) => onMark?.(r.personId, s)} />
                ) : (
                  <span className={`ta-card__status-pill ta-card__status-pill--${r.status}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                )}
              </div>
            ))
          ) : (
            <p className="ta-card__roster-empty">No students on this team yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default TeamMeetingCard;
