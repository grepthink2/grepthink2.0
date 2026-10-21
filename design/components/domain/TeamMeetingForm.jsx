import React from 'react';
import { Button } from '../primitives/Button.jsx';
import { Input } from '../primitives/Input.jsx';
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
 * new meeting, in place of the row it edits. Built from the shared Input, Select, Textarea, Alert and
 * Button (the codebase's TeamMeetingForm.tsx uses the same shared pieces): required fields carry no
 * mark, Room, Zoom link and Note say "(optional)", title and note use the shared "n / max" counter.
 * Times are typed on the viewer's clock (like the Final Reviews time fields); when the viewer's zone
 * differs from campus the campus time is the time field's help line. Validates on submit and focuses
 * the first problem; Esc cancels and stays inside the form (the modal doesn't close). A save error
 * (`error`) shows as an Alert above the actions and keeps what was typed.
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
  const field = (k) => ({ id: f(k), name: k, value: draft[k], onChange: set(k), disabled: saving, error: errors[k] });

  return (
    <form ref={rootRef} className={['gt-tmform', className].filter(Boolean).join(' ')} onSubmit={submit} onKeyDown={onKeyDown} aria-labelledby={f('h')} noValidate>
      <h4 id={f('h')} className="gt-tmform__title">{creating ? 'New meeting' : 'Edit meeting'}</h4>

      <Input {...field('title')} label="Title" required maxLength={TEAM_MEETING_TITLE_MAX} showCount placeholder="Sprint 3 planning" autoComplete="off" />

      <div className="gt-tmform__grid gt-tmform__grid--when">
        <Input {...field('date')} label="Date" type="date" required min={creating ? dayKey(nowD, vz) : undefined} />
        <Input {...field('time')} label="Start time" type="time" step={900} required helperText={campus ? `${campus} on campus` : undefined} />
        <Select id={f('durationMinutes')} name="durationMinutes" label="Duration" value={String(draft.durationMinutes)} onChange={set('durationMinutes')} disabled={saving}
          options={TEAM_MEETING_DURATIONS.map((d) => ({ value: String(d), label: fmtMinutes(d) }))} />
      </div>

      <div className="gt-tmform__grid gt-tmform__grid--place">
        <Input {...field('location')} label="Room" optional placeholder="E2 room 180" autoComplete="off" />
        <Input {...field('zoomUrl')} label="Zoom link" optional type="url" inputMode="url" placeholder="https://ucsc.zoom.us/j/…" autoComplete="off" spellCheck={false} />
      </div>

      <Textarea {...field('note')} label="Note" optional rows={2} maxLength={TEAM_MEETING_NOTE_MAX} placeholder="Anything the team should bring or read first" />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="gt-tmform__foot">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" loading={saving} loadingLabel={creating ? 'Adding…' : 'Saving…'}>{creating ? 'Add meeting' : 'Save changes'}</Button>
      </div>
    </form>
  );
}
