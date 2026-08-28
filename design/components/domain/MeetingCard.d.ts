import * as React from 'react';

export interface MeetingCardProps {
  /** Team the meeting is with. */
  team: string;
  /** Formatted time ("Tue Jan 20 · 3:00 PM"). */
  time: string;
  /** Zoom link — renders a "Join Zoom" action. */
  zoomUrl?: string;
  /** Attendee names for the avatar group. */
  attendees?: string[];
  /** Attendance summary chip. */
  attendance?: { present: number; total: number };
  /** @default 'upcoming' */
  status?: 'upcoming' | 'completed' | 'missed';
  /** Shows a "Mark attendance" button. */
  onMarkAttendance?: () => void;
  className?: string;
}

export function MeetingCard(props: MeetingCardProps): React.JSX.Element;
