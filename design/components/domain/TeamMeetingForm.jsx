import React from 'react';
import { Button } from '../primitives/Button.jsx';
import { Select } from '../primitives/Select.jsx';
import { Textarea } from '../primitives/Textarea.jsx';
import { Alert } from '../feedback/Alert.jsx';
import { ScheduleModel, SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';
import { TeamMeetingsModel, TEAM_MEETING_TITLE_MAX, TEAM_MEETING_NOTE_MAX, TEAM_MEETING_DURATIONS } from './TeamMeetingsModel.jsx';

const { zoneDiffers, viewerZone, dayKey } = ScheduleModel;
const { draftFrom, validateTeamMeeting, campusTimeOf, fmtMinutes } = TeamMeetingsModel;
const ORDER = ['title', 'date', 'time', 'zoomUrl', 'note'];

/**
 * Add / edit one team meeting. Lives inline in the Edit Project → Meetings tab: above the list for a
 * new meeting, in place of the row it edits. Times are typed on the viewer's clock (like the Final
 * Reviews time fields); when the viewer's zone differs from campus the campus time appears under the
 * time field. Validates on submit, focuses the first problem; Esc cancels and stays inside the form
 * (the modal doesn't close). A save error (`error`) renders inline and keeps what was typed.
 */
export function TeamMeetingForm({ mode = 'create', meeting = null, now, zone, schoolZone = SCHOOL_ZONE, saving = false, error = null, onSubmit, onCancel, className = '' }) {
  const vz = zone || viewerZone();
  const [draft, setDraft] = React.useState(() => draftFrom(meeting, vz));
  const [errors, setErrors] = React.useState({});
  const uid = React.useId();
  const rootRef = React.useRef(null);
  React.useEffect(() => { const el = rootRef.current && rootRef.current.querySelector('input[name="title"]'); if (el) el.focus(); }, []);

  const nowD = now || new Date();
  const creating = mode === 'create';
  const differs = zoneDiffers(vz, schoolZone, nowD);
  const campus = differs ? campusTimeOf(draft.date, draft.time, vz, schoolZone) : null;
  const f = (k) => `${uid}-${k}`;
  const set = (k) => (e) => {
    const v = e && e.target ? e.target.value : e;
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((er) => { const n = { ...er }; delete n[k]; return n; });
  };
  const submit = (e) => {
    e.preventDefault();
    if (saving) return;
    const r = validateTeamMeeting(draft, { now: nowD, zone: vz, creating });
    setErrors(r.errors);
    if (!r.valid) {
      const first = ORDER.find((k) => r.errors[k]);
      const el = rootRef.current && rootRef.current.querySelector(`[name="${first}"]`);
      if (el) el.focus();
      return;
    }
    if (onSubmit) onSubmit(r.value, draft);
  };
  const onKeyDown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (!saving && onCancel) onCancel(); } };

  const control = (k, extra) => ({
    id: f(k), name: k, className: 'gt-input', value: draft[k], onChange: set(k), disabled: saving,
    'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? f(`${k}-err`) : extra && extra.help ? f(`${k}-help`) : undefined,
  });
  const field = (k, label, node, { required, help } = {}) => (
    <div className={['gt-field', errors[k] ? 'gt-field--error' : ''].filter(Boolean).join(' ')}>
      <label className="gt-field__label" htmlFor={f(k)}>{label}{required && <span className="gt-field__required" aria-hidden="true"> *</span>}</label>
      {node}
      {errors[k] ? <p className="gt-field__error" id={f(`${k}-err`)}>{errors[k]}</p> : help ? <p className="gt-field__help gt-tmform__campus" id={f(`${k}-help`)}>{help}</p> : null}
    </div>
  );

  return (
    <form ref={rootRef} className={['gt-tmform', className].filter(Boolean).join(' ')} onSubmit={submit} onKeyDown={onKeyDown} aria-labelledby={f('h')} noValidate>
      <h4 id={f('h')} className="gt-tmform__title">{creating ? 'New meeting' : 'Edit meeting'}</h4>

      <div className={['gt-field', errors.title ? 'gt-field--error' : ''].filter(Boolean).join(' ')}>
        <label className="gt-field__label" htmlFor={f('title')}>Title<span className="gt-field__required" aria-hidden="true"> *</span></label>
        <input {...control('title')} type="text" maxLength={TEAM_MEETING_TITLE_MAX} placeholder="Sprint 3 planning" autoComplete="off" />
        <div className="gt-field__footer">
          {errors.title ? <p className="gt-field__error" id={f('title-err')}>{errors.title}</p> : <span />}
          <span className="gt-field__count">{draft.title.length}/{TEAM_MEETING_TITLE_MAX}</span>
        </div>
      </div>

      <div className="gt-tmform__grid gt-tmform__grid--when">
        {field('date', 'Date', <input {...control('date')} type="date" min={creating ? dayKey(nowD, vz) : undefined} />, { required: true })}
        {field('time', 'Start time', <input {...control('time', { help: campus })} type="time" step={900} />, { required: true, help: campus ? `${campus} on campus` : null })}
        <Select id={f('durationMinutes')} name="durationMinutes" label="Duration" value={String(draft.durationMinutes)} onChange={set('durationMinutes')} disabled={saving}
          options={TEAM_MEETING_DURATIONS.map((d) => ({ value: String(d), label: fmtMinutes(d) }))} />
      </div>

      <div className="gt-tmform__grid gt-tmform__grid--place">
        {field('location', 'Room', <input {...control('location')} type="text" placeholder="E2 room 180" autoComplete="off" />)}
        {field('zoomUrl', 'Zoom link', <input {...control('zoomUrl')} type="url" inputMode="url" placeholder="https://ucsc.zoom.us/j/…" autoComplete="off" spellCheck={false} />)}
      </div>

      <Textarea id={f('note')} name="note" label="Note" rows={2} value={draft.note} onChange={set('note')} maxLength={TEAM_MEETING_NOTE_MAX} showCount
        placeholder="Anything the team should bring or read first" error={errors.note} disabled={saving} />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="gt-tmform__foot">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" loading={saving}>{creating ? 'Add meeting' : 'Save changes'}</Button>
      </div>
    </form>
  );
}
