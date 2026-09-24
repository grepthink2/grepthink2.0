import React from 'react';
import { Badge } from '../display/Badge.jsx';
import { AvatarGroup } from '../display/Avatar.jsx';
import { Button } from '../primitives/Button.jsx';

/**
 * TA meeting card — team, time, Zoom link, attendance chips.
 */
export function MeetingCard({
  team,
  time,
  zoomUrl,
  attendees = [],
  attendance,
  status = 'upcoming',
  onMarkAttendance,
  className = '',
}) {
  const tone = status === 'completed' ? 'success' : status === 'missed' ? 'error' : 'info';
  const label = status === 'completed' ? 'Completed' : status === 'missed' ? 'Missed' : 'Upcoming';

  return (
    <div className={['gt-meeting-card', className].filter(Boolean).join(' ')}>
      <div className="gt-meeting-card__head">
        <div className="gt-meeting-card__id">
          <span className="gt-meeting-card__team">{team}</span>
          <span className="gt-meeting-card__time">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {time}
          </span>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="gt-meeting-card__body">
        {attendees.length > 0 && <AvatarGroup names={attendees} max={5} />}
        {attendance != null && (
          <span className="gt-meeting-card__attendance">{attendance.present}/{attendance.total} present</span>
        )}
      </div>
      <div className="gt-meeting-card__actions">
        {zoomUrl && (
          <a className="gt-meeting-card__zoom" href={zoomUrl} target="_blank" rel="noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M23 7l-7 5 7 5V7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="1" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
            </svg>
            Join Zoom
          </a>
        )}
        {onMarkAttendance && (
          <Button size="sm" variant="secondary" onClick={onMarkAttendance}>Mark attendance</Button>
        )}
      </div>
    </div>
  );
}
