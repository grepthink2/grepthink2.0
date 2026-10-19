import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, CircleX } from 'lucide-react';
import { parseExternalTasksUrl } from '@/lib/externalTasksUrl';
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
  /** Pin the clock (tests, demos); otherwise the time of each render and of the submit. */
  now?: Date;
  /** Viewer's IANA zone; defaults to the browser's. Date and time fields read on this clock. */
  zone?: string;
  /** When it differs from `zone`, "3:00 PM PT on campus" appears under the time field. @default 'America/Los_Angeles' */
  schoolZone?: string;
  /** Disables the fields and spins the submit button. @default false */
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
 * meeting, in place of the row it edits. Port of design/components/domain/TeamMeetingForm.jsx; the
 * Button, Select, Textarea and Alert it uses are plain elements with their design classes.
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
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const nowD = now ?? new Date();
  const creating = mode === 'create';
  const differs = zoneDiffers(vz, schoolZone, nowD);
  const campus = differs ? campusTimeOf(draft.date, draft.time, vz, schoolZone) : null;
  const timeHelp = campus ? `${campus} on campus` : null;
  const id = (key: string): string => `${uid}-${key}`;

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
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
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

  const fieldClass = (key: FieldKey): string =>
    ['gt-field', errors[key] ? 'gt-field--error' : '', saving ? 'gt-field--disabled' : ''].filter(Boolean).join(' ');
  const describedBy = (key: FieldKey, help?: string | null): string | undefined =>
    errors[key] ? id(`${key}-err`) : help ? id(`${key}-help`) : undefined;
  const control = (key: Exclude<FieldKey, 'note'>, help?: string | null) => ({
    id: id(key),
    name: key,
    className: 'gt-input',
    value: draft[key],
    onChange: change(key),
    disabled: saving,
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': describedBy(key, help),
  });
  const label = (key: FieldKey, text: string, required = false) => (
    <label className="gt-field__label" htmlFor={id(key)}>
      {text}
      {required && <span className="gt-field__required" aria-hidden="true"> *</span>}
    </label>
  );
  const errorText = (key: FieldKey) => <p className="gt-field__error" id={id(`${key}-err`)}>{errors[key]}</p>;
  const field = (
    key: Exclude<FieldKey, 'title' | 'note'>,
    text: string,
    input: ReactNode,
    { required = false, help = null }: { required?: boolean; help?: string | null } = {},
  ) => (
    <div className={fieldClass(key)}>
      {label(key, text, required)}
      {input}
      {errors[key] ? errorText(key) : help ? <p className="gt-field__help gt-tmform__campus" id={id(`${key}-help`)}>{help}</p> : null}
    </div>
  );

  return (
    <form
      ref={formRef}
      className={['gt-tmform', className].filter(Boolean).join(' ')}
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-labelledby={id('h')}
      noValidate
    >
      <h4 id={id('h')} className="gt-tmform__title">{creating ? 'New meeting' : 'Edit meeting'}</h4>

      <div className={fieldClass('title')}>
        {label('title', 'Title', true)}
        <input
          ref={titleRef}
          {...control('title')}
          aria-required="true"
          type="text"
          maxLength={TEAM_MEETING_TITLE_MAX}
          placeholder="Sprint 3 planning"
          autoComplete="off"
        />
        <div className="gt-field__footer">
          {errors.title ? errorText('title') : <span />}
          <span className="gt-field__count">{draft.title.length}/{TEAM_MEETING_TITLE_MAX}</span>
        </div>
      </div>

      <div className="gt-tmform__grid gt-tmform__grid--when">
        {field('date', 'Date', <input {...control('date')} aria-required="true" type="date" min={creating ? dayKey(nowD, vz) : undefined} />, {
          required: true,
        })}
        {field('time', 'Start time', <input {...control('time', timeHelp)} aria-required="true" type="time" step={900} />, {
          required: true,
          help: timeHelp,
        })}
        <div className={['gt-field', saving ? 'gt-field--disabled' : ''].filter(Boolean).join(' ')}>
          <label className="gt-field__label" htmlFor={id('durationMinutes')}>Duration</label>
          <div className="gt-select">
            <select
              id={id('durationMinutes')}
              name="durationMinutes"
              className="gt-select__control"
              value={String(draft.durationMinutes)}
              onChange={(e) => edit({ ...draft, durationMinutes: Number(e.target.value) })}
              disabled={saving}
            >
              {TEAM_MEETING_DURATIONS.map((minutes) => (
                <option key={minutes} value={String(minutes)}>{fmtMinutes(minutes)}</option>
              ))}
            </select>
            <ChevronDown className="gt-select__chevron" size={16} aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="gt-tmform__grid gt-tmform__grid--place">
        {field('location', 'Room', <input {...control('location')} type="text" maxLength={LOCATION_MAX} placeholder="E2 room 180" autoComplete="off" />)}
        {field(
          'zoomUrl',
          'Zoom link',
          <input
            {...control('zoomUrl')}
            type="url"
            inputMode="url"
            maxLength={ZOOM_URL_MAX}
            placeholder="https://ucsc.zoom.us/j/…"
            autoComplete="off"
            spellCheck={false}
          />,
        )}
      </div>

      <div className={fieldClass('note')}>
        {label('note', 'Note')}
        <textarea
          id={id('note')}
          name="note"
          className="gt-textarea"
          rows={2}
          value={draft.note}
          onChange={change('note')}
          maxLength={TEAM_MEETING_NOTE_MAX}
          placeholder="Anything the team should bring or read first"
          disabled={saving}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={describedBy('note')}
        />
        <div className="gt-field__footer">
          {errors.note ? errorText('note') : <span />}
          <span className="gt-field__count">{draft.note.length}/{TEAM_MEETING_NOTE_MAX}</span>
        </div>
      </div>

      {error && (
        <div className="gt-alert gt-alert--error" role="alert">
          <span className="gt-alert__icon"><CircleX size={16} aria-hidden="true" /></span>
          <div className="gt-alert__content"><p className="gt-alert__text">{error}</p></div>
        </div>
      )}

      <div className="gt-tmform__foot">
        <button type="button" className="gt-button gt-button--secondary gt-button--sm" onClick={onCancel} disabled={saving}>
          <span className="gt-button__label">Cancel</span>
        </button>
        <button
          type="submit"
          className={['gt-button', 'gt-button--primary', 'gt-button--sm', saving ? 'gt-button--loading' : ''].filter(Boolean).join(' ')}
          disabled={saving}
          aria-busy={saving || undefined}
        >
          {saving && <span className="gt-button__spinner" aria-hidden="true" />}
          <span className="gt-button__label">{creating ? 'Add meeting' : 'Save changes'}</span>
        </button>
      </div>
    </form>
  );
}
