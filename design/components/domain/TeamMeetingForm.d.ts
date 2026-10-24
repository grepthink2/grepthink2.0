// Intentional addition: TeamMeetingForm — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { TeamMeeting, TeamMeetingDraft, TeamMeetingPayload } from './TeamMeetingsModel';

export interface TeamMeetingFormProps {
  /** @default 'create' — 'create' adds the no-past-start rule and labels the submit "Add meeting". */
  mode?: 'create' | 'edit';
  /** The meeting being edited (seeds the draft on the viewer's clock). */
  meeting?: TeamMeeting | null;
  /** Pin the clock (tests, demos). */
  now?: Date;
  /** Viewer's IANA zone; defaults to the browser's. Date and time fields read on this clock. */
  zone?: string;
  /** @default 'America/Los_Angeles' — when it differs from `zone`, "3:00 PM PT on campus" appears under the time field. */
  schoolZone?: string;
  /** Disables the fields and spins the submit button. @default false */
  saving?: boolean;
  /** Inline save error, rendered above the actions; the draft is kept. */
  error?: string | null;
  /** Called with the validated API payload (and the raw draft). */
  onSubmit?: (value: TeamMeetingPayload, draft: TeamMeetingDraft) => void;
  /** Cancel button and Esc. */
  onCancel?: () => void;
  className?: string;
}

/** Add / edit one team meeting — inline in the Edit Project → Meetings tab. */
export function TeamMeetingForm(props: TeamMeetingFormProps): React.JSX.Element;
