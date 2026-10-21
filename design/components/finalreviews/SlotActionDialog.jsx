import React from 'react';
import { Button } from '../primitives/Button.jsx';
import { Select } from '../primitives/Select.jsx';
import { Modal } from '../feedback/Modal.jsx';
import { Alert } from '../feedback/Alert.jsx';
import { SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';
import { FinalReviewsModel } from './FinalReviewsModel.jsx';

const { whenText, fmtSlotWhen, freeSlotGroups, slotPhase } = FinalReviewsModel;
const own = (n) => (/s$/i.test(n) ? `${n}’` : `${n}’s`);

/**
 * The instructor's choose-and-confirm dialog — one Select and the consequence, said before the
 * button: `place_team` (a team onto a free slot; teams without a slot first, booked teams move),
 * `place_on_slot` (a team without a slot onto a free slot), `move_team` (a booked team to a free slot),
 * `review_ta` (appoint, replace or remove; never the Home TA). Started slots are offered, because
 * placing a team there records a review held outside the app. Moving drops the Review TA and says so;
 * a passed review time adds the "scores stay" warning. Native Select (optgroups) — Combobox lands after C2.
 */
export function SlotActionDialog({
  open = false, kind = 'place_team', slot = null, team = null, slots = [], unbooked = [], teamsById = {}, tas = [], reviewCounts = {},
  now, zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE, defaultValue, onConfirm, onCancel, portal = true,
}) {
  const nowD = now || new Date();
  const when = (iso) => whenText(iso, { zone, schoolZone });
  const initial = defaultValue !== undefined ? defaultValue : kind === 'review_ta' ? (team && team.review_ta ? team.review_ta.user_id : '') : '';
  const [value, setValue] = React.useState(initial);
  const [fieldError, setFieldError] = React.useState(null);
  const [failed, setFailed] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setValue(initial); setFieldError(null); setFailed(null); setBusy(false); } }, [open, kind, slot && slot.id, team && team.project_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const booked = slots.filter((s) => s.team);
  const teamAt = (id) => {
    const s = booked.find((b) => b.team.project_id === id);
    const u = unbooked.find((t) => t.project_id === id);
    return { ...(teamsById[id] || {}), ...(u || {}), project_id: id, name: (s && s.team.name) || (u && u.name) || (teamsById[id] && teamsById[id].name), slot_id: s ? s.id : null, starts_at: s ? s.starts_at : null };
  };
  const slotById = (id) => slots.find((s) => s.id === id);
  const passedLine = (t, verb) => `${own(t.name)} review time has passed, so the review may already have been held and scored. ${verb} clears that time${t.review_ta ? ' and its Review TA' : ''}; the scores already entered stay.`;
  const startedLine = 'This slot has started. Placing a team here records a review held outside the app.';

  let title, subtitle, label, options, placeholder, confirmLabel, busyLabel, lines = [], destructive = false, helper;
  if (kind === 'place_team') {
    title = 'Place a team';
    subtitle = slot ? when(slot.starts_at) : null;
    label = 'Team'; placeholder = 'Choose a team';
    options = [
      { label: 'Without a slot', options: unbooked.map((t) => ({ value: t.project_id, label: t.product_owner ? t.name : `${t.name} (no Product Owner)` })) },
      { label: 'Booked — moves the team', options: booked.map((s) => { const w = fmtSlotWhen(s.starts_at, { zone, schoolZone }); return { value: s.team.project_id, label: `${s.team.name} · ${w.day}, ${w.start}` }; }) },
    ].filter((g) => g.options.length);
    const t = value ? teamAt(value) : null;
    const moves = !!(t && t.slot_id);
    confirmLabel = moves ? 'Move team' : 'Place team'; busyLabel = moves ? 'Moving…' : 'Placing…';
    if (t && slot) {
      if (moves) {
        lines.push(`Move ${t.name} to ${when(slot.starts_at)}? Its slot on ${when(t.starts_at)} becomes free.`);
        if (t.review_ta) lines.push(`${t.review_ta.name} will no longer be its Review TA.`);
        if (slotPhase(t.starts_at, nowD) !== 'upcoming') lines.push(passedLine(t, 'Moving'));
        destructive = !!t.review_ta || slotPhase(t.starts_at, nowD) !== 'upcoming';
      } else {
        lines.push(`${t.name} gets ${when(slot.starts_at)}.`);
        if (t.review_ta) lines.push(`${t.review_ta.name} stays its Review TA.`);
      }
    }
    if (slot && slotPhase(slot.starts_at, nowD) !== 'upcoming') lines.push(startedLine);
  } else if (kind === 'place_on_slot' || kind === 'move_team') {
    const move = kind === 'move_team';
    title = move ? `Move ${team ? team.name : 'team'}` : `Place ${team ? team.name : 'team'} on a slot`;
    subtitle = move && team && team.starts_at ? `Now ${when(team.starts_at)}` : 'Free slots, in your time zone';
    label = move ? 'New slot' : 'Slot'; placeholder = 'Choose a slot';
    options = freeSlotGroups(slots, { zone, schoolZone, now: nowD, includeStarted: true, exceptId: team && team.slot_id });
    confirmLabel = move ? 'Move team' : 'Place team'; busyLabel = move ? 'Moving…' : 'Placing…';
    const target = value ? slotById(value) : null;
    if (team && target) {
      if (move) {
        lines.push(`Move ${team.name} to ${when(target.starts_at)}? Its current slot, ${when(team.starts_at)}, becomes free.`);
        if (team.review_ta) lines.push(`${team.review_ta.name} will no longer be its Review TA. You can appoint them again afterwards.`);
        if (team.starts_at && slotPhase(team.starts_at, nowD) !== 'upcoming') lines.push(passedLine(team, 'Moving'));
        destructive = !!team.review_ta || (team.starts_at && slotPhase(team.starts_at, nowD) !== 'upcoming');
      } else {
        lines.push(`${team.name} gets ${when(target.starts_at)}.`);
        if (team.review_ta) lines.push(`${team.review_ta.name} stays its Review TA.`);
      }
      if (slotPhase(target.starts_at, nowD) !== 'upcoming') lines.push(startedLine);
    }
    if (!options.length) helper = 'There are no free slots. Post more, or release a team first.';
  } else {
    const home = team && team.home_ta;
    const current = team && team.review_ta;
    title = `Review TA for ${team ? team.name : 'team'}`;
    subtitle = team && team.starts_at ? when(team.starts_at) : 'No slot yet';
    label = 'Review TA';
    const listed = tas.filter((t) => !home || t.id !== home.user_id).map((t) => ({ value: t.id, label: `${t.name}${reviewCounts[t.id] ? ` · reviews ${reviewCounts[t.id]}` : ''}` }));
    if (current && !listed.some((o) => o.value === current.user_id)) listed.push({ value: current.user_id, label: `${current.name} (no longer listed)` });
    options = [{ value: '', label: 'No Review TA' }, ...listed];
    helper = home ? `${own(team.name)} Home TA, ${home.name}, isn’t listed.` : undefined;
    confirmLabel = 'Save'; busyLabel = 'Saving…';
    const chosen = listed.find((o) => o.value === value);
    const chosenName = chosen ? (tas.find((t) => t.id === value) || current || {}).name : null;
    if (team && (value || '') !== (current ? current.user_id : '')) {
      if (!value && current) lines.push(`${current.name} will no longer be ${own(team.name)} Review TA.`);
      else if (current) lines.push(`${chosenName} replaces ${current.name} as ${own(team.name)} Review TA.`);
      else lines.push(`${chosenName} becomes ${own(team.name)} Review TA.`);
    }
    if (team && !team.starts_at) lines.push(`${team.name} has no slot yet. Its first booking keeps this Review TA.`);
  }

  const submit = async () => {
    if (kind !== 'review_ta' && !value) { setFieldError(kind === 'place_team' ? 'Choose a team.' : 'Choose a slot.'); return; }
    if (kind === 'review_ta' && (value || '') === (team && team.review_ta ? team.review_ta.user_id : '')) { if (onCancel) onCancel(); return; }
    setBusy(true); setFailed(null);
    try {
      if (onConfirm) await onConfirm(kind === 'review_ta' ? { userId: value || null } : kind === 'place_team' ? { projectId: value, slotId: slot && slot.id } : { slotId: value, projectId: team && team.project_id });
    } catch (e) {
      setFailed((e && e.message) || 'That didn’t work. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onCancel} portal={portal} size="md" title={title} subtitle={subtitle} closeDisabled={busy} className="gt-fr-dialog"
      footer={(
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={submit} loading={busy} loadingLabel={busyLabel}>{confirmLabel}</Button>
        </>
      )}>
      <form className="gt-fr-dialog__body" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Select label={label} value={value} onChange={(e) => { setValue(e.target.value); setFieldError(null); }} options={options} placeholder={placeholder}
          error={fieldError} helperText={helper} disabled={busy} data-autofocus />
        {lines.length > 0 && <div className="gt-fr-dialog__consequence" aria-live="polite">{lines.map((l) => <p key={l}>{l}</p>)}</div>}
        {failed && <Alert tone="error">{failed}</Alert>}
      </form>
    </Modal>
  );
}
