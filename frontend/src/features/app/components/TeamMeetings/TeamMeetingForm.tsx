import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { Input } from '@/components/Input/Input';
import { Select } from '@/components/Select/Select';
import { Textarea } from '@/components/Textarea/Textarea';
import { parseExternalTasksUrl } from '@/lib/externalTasksUrl';
import { useNow } from '@/lib/useNow';
import { SCHOOL_ZONE, dayKey, viewerZone, zoneDiffers } from '@features/schedule/scheduleModel';
import {
  TEAM_MEETING_DURATIONS,
  TEAM_MEETING_NOTE_MAX,
  TEAM_MEETING_TITLE_MAX,
  campusTimeOf,
  draftFrom,
  fmtMinutes,
  validateTeamMeeting,
  type TeamMeeting,
  type TeamMeetingDraft,
  type TeamMeetingPayload,
} from './teamMeetingsModel';
import './teamMeetings.scss';

/** The API's limits that the handoff's rules leave to the form (backend app/team_meetings/models.py). */
const LOCATION_MAX = 120;
const ZOOM_URL_MAX = 500;
/** The handoff's copy for a link that won't work (validateTeamMeeting says the same). */
const ZOOM_URL_ERROR = 'Enter the full link, like https://ucsc.zoom.us/j/…';

type FieldKey = 'title' | 'date' | 'time' | 'location' | 'zoomUrl' | 'note';
type FieldErrors = Partial<Record<FieldKey, string>>;
/** The order fields take focus in when they have a problem: the form's own order. */
const ORDER: FieldKey[] = ['title', 'date', 'time', 'location', 'zoomUrl', 'note'];

/**
 * What the API refuses with a 422 that validateTeamMeeting lets through: a room over 120 characters,
 * and a Zoom link over 500 characters or one the API's link rule refuses. lib/externalTasksUrl
 * mirrors that rule; the handoff's isHttpUrl would pass "https://ucsc.zoom.us/j/1 2".
 */
function apiRules(draft: TeamMeetingDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.location.trim().length > LOCATION_MAX) errors.location = `Keep the room under ${LOCATION_MAX} characters.`;
  const zoomUrl = draft.zoomUrl.trim();
  if (zoomUrl && (zoomUrl.length > ZOOM_URL_MAX || 'error' in parseExternalTasksUrl(zoomUrl))) {
    errors.zoomUrl = ZOOM_URL_ERROR;
  }
  return errors;
}

export interface TeamMeetingFormProps {
  /** 'create' adds the no-past-start rule and labels the submit "Add meeting". @default 'create' */
  mode?: 'create' | 'edit';
  /** The meeting being edited (seeds the draft on the viewer's clock). */
  meeting?: TeamMeeting | null;
  /** Pin the clock (tests, demos); otherwise renders read a 30-second clock and the submit reads the current time. */
  now?: Date;
  /** Viewer's IANA zone; defaults to the browser's. Date and time fields read on this clock. */
  zone?: string;
  /** When it differs from `zone`, "3:00 PM PT on campus" appears under the time field. @default 'America/Los_Angeles' */
  schoolZone?: string;
  /** Disables the fields and Cancel, and puts the submit button in its busy state. @default false */
  saving?: boolean;
  /** Inline save error, shown above the buttons; the draft is kept. */
  error?: string | null;
  /** Called with the validated API payload (and the raw draft). */
  onSubmit?: (value: TeamMeetingPayload, draft: TeamMeetingDraft) => void;
  /** The Cancel button and Escape. */
  onCancel?: () => void;
  /** Told, as each field changes, whether the draft now differs from what the form opened with. */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}

/**
 * Add or edit one team meeting, inline in the Edit Project Meetings tab: above the list for a new
 * meeting, in place of the row it edits. Port of design/components/domain/TeamMeetingForm.jsx; its
 * fields are the shared Input, Select and Textarea and its buttons the shared Button, and the save
 * error is a plain element with the design's Alert classes. Date and time stay the native pickers.
 * Required fields carry no mark; Room, Zoom link and Note say "(optional)". The limits are soft: a
 * field past its limit keeps the text and is flagged, and the submit refuses it.
 * Times are typed on the viewer's clock, with the campus time under the time field when the zones
 * differ. Validates on submit (the handoff's rules plus the API's limits) and focuses the first
 * problem. Escape cancels without closing the Edit Project modal around it.
 */
export function TeamMeetingForm({
  mode = 'create', meeting = null, now, zone, schoolZone = SCHOOL_ZONE, saving = false, error = null, onSubmit, onCancel,
  onDirtyChange, className = '',
}: TeamMeetingFormProps) {
  const vz = zone || viewerZone();
  /** What the form opened with: a draft that matches it again is not unsaved input. */
  const [opened] = useState<TeamMeetingDraft>(() => draftFrom(meeting, vz));
  const [draft, setDraft] = useState<TeamMeetingDraft>(opened);
  const [errors, setErrors] = useState<FieldErrors>({});
  const uid = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const zoomUrlRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const nowD = useNow(30000, now);
  const creating = mode === 'create';
  const differs = zoneDiffers(vz, schoolZone, nowD);
  const campus = differs ? campusTimeOf(draft.date, draft.time, vz, schoolZone) : null;
  const timeHelp = campus ? `${campus} on campus` : null;
  const headingId = `${uid}-h`;

  const edit = (next: TeamMeetingDraft) => {
    setDraft(next);
    onDirtyChange?.((Object.keys(next) as (keyof TeamMeetingDraft)[]).some((key) => next[key] !== opened[key]));
  };

  const change = (key: FieldKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    edit({ ...draft, [key]: e.target.value });
    if (errors[key]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const result = validateTeamMeeting(draft, { now: now ?? new Date(), zone: vz, creating });
    const found: FieldErrors = { ...result.errors, ...apiRules(draft) };
    setErrors(found);
    const first = ORDER.find((key) => found[key]);
    if (first) {
      const fields = { title: titleRef, date: dateRef, time: timeRef, location: locationRef, zoomUrl: zoomUrlRef, note: noteRef };
      fields[first].current?.focus();
      return;
    }
    if (result.value) onSubmit?.(result.value, draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Escape') return;
    // The Edit Project modal closes on an Escape that reaches the document: this one only cancels the form.
    e.stopPropagation();
    e.preventDefault();
    if (!saving) onCancel?.();
  };

  return (
    <form
      className={['gt-tmform', className].filter(Boolean).join(' ')}
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-labelledby={headingId}
      noValidate
    >
      <h4 id={headingId} className="gt-tmform__title">{creating ? 'New meeting' : 'Edit meeting'}</h4>

      <Input
        ref={titleRef}
        name="title"
        label="Title"
        aria-required="true"
        value={draft.title}
        onChange={change('title')}
        maxLength={TEAM_MEETING_TITLE_MAX}
        showCount
        placeholder="Sprint 3 planning"
        autoComplete="off"
        error={errors.title}
        disabled={saving}
      />

      <div className="gt-tmform__grid gt-tmform__grid--when">
        <Input
          ref={dateRef}
          name="date"
          label="Date"
          type="date"
          aria-required="true"
          min={creating ? dayKey(nowD, vz) : undefined}
          value={draft.date}
          onChange={change('date')}
          error={errors.date}
          disabled={saving}
        />
        <Input
          ref={timeRef}
          name="time"
          label="Start time"
          type="time"
          step={900}
          aria-required="true"
          value={draft.time}
          onChange={change('time')}
          error={errors.time}
          helperText={timeHelp ? <span className="gt-tmform__campus">{timeHelp}</span> : undefined}
          disabled={saving}
        />
        <Select
          name="durationMinutes"
          label="Duration"
          value={String(draft.durationMinutes)}
          onChange={(e) => edit({ ...draft, durationMinutes: Number(e.target.value) })}
          options={TEAM_MEETING_DURATIONS.map((minutes) => ({ value: String(minutes), label: fmtMinutes(minutes) }))}
          disabled={saving}
        />
      </div>

      <div className="gt-tmform__grid gt-tmform__grid--place">
        <Input
          ref={locationRef}
          name="location"
          label="Room"
          optional
          value={draft.location}
          onChange={change('location')}
          maxLength={LOCATION_MAX}
          placeholder="E2 room 180"
          autoComplete="off"
          error={errors.location}
          disabled={saving}
        />
        <Input
          ref={zoomUrlRef}
          name="zoomUrl"
          label="Zoom link"
          optional
          type="url"
          inputMode="url"
          value={draft.zoomUrl}
          onChange={change('zoomUrl')}
          maxLength={ZOOM_URL_MAX}
          placeholder="https://ucsc.zoom.us/j/…"
          autoComplete="off"
          spellCheck={false}
          error={errors.zoomUrl}
          disabled={saving}
        />
      </div>

      <Textarea
        ref={noteRef}
        name="note"
        label="Note"
        optional
        rows={2}
        value={draft.note}
        onChange={change('note')}
        maxLength={TEAM_MEETING_NOTE_MAX}
        placeholder="Anything the team should bring or read first"
        error={errors.note}
        disabled={saving}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="gt-tmform__foot">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" loading={saving} loadingLabel={creating ? 'Adding…' : 'Saving…'}>
          {creating ? 'Add meeting' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
