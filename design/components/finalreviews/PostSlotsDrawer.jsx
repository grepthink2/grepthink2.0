import React from 'react';
import { Badge } from '../display/Badge.jsx';
import { Button } from '../primitives/Button.jsx';
import { IconButton } from '../primitives/IconButton.jsx';
import { Input } from '../primitives/Input.jsx';
import { Drawer } from '../feedback/Drawer.jsx';
import { Alert } from '../feedback/Alert.jsx';
import { SCHOOL_ZONE, ScheduleModel } from '../schedule/ScheduleModel.jsx';
import { FinalReviewsModel } from './FinalReviewsModel.jsx';
import { FinalReviewsIcon } from './FinalReviewsIcon.jsx';

const { hourlyStarts, postingDraft, SLOT_POST_MAX } = FinalReviewsModel;
const { zoneLabel, zoneDiffers } = ScheduleModel;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Post slots (instructor) — a right Drawer. Days and times are typed on the campus clock: a day, a
 * first and a last start add every hour between them; a single time is a first start with no last.
 * The list it will post sits below, by campus day, each time with the viewer's equivalent when the
 * zones differ and its flags: already posted (the server skips it), in the past (allowed — teams can't
 * book it; the instructor can place a team), and overlaps — refused: slots never overlap (brief call 15),
 * so a start less than an hour from another slot, posted or listed, is an error naming that slot, with
 * Change (back into the Add fields) and × — nothing posts until each is fixed. At most 200 times per post. Esc / Cancel close it; the draft is kept
 * until it posts.
 */
export function PostSlotsDrawer({
  open = false, onClose, onPost, existing = [], now, zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE, defaultEntries = [],
  defaultDay = '', portal = true, width = 480,
}) {
  const nowD = now || new Date();
  const [day, setDay] = React.useState(defaultDay);
  const [first, setFirst] = React.useState('09:00');
  const [last, setLast] = React.useState('16:00');
  const [entries, setEntries] = React.useState(defaultEntries);
  const [errors, setErrors] = React.useState({});
  const [submitError, setSubmitError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState('');
  const rootRef = React.useRef(null);
  const campus = zoneLabel(schoolZone, nowD);
  const differs = zoneDiffers(zone, schoolZone, nowD);
  const draft = postingDraft(entries, { existing, now: nowD, zone, schoolZone });
  const preview = day && first ? postingDraft([{ date: day, time: first }], { now: nowD, zone, schoolZone }).items[0] : null;

  const add = () => {
    const e = {};
    if (!day) e.day = 'Pick a day.';
    if (!first) e.first = 'Pick a start time.';
    const times = first ? hourlyStarts(first, last) : [];
    if (first && last && times === null) e.last = 'The last start comes before the first.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const keys = new Set(entries.map((x) => `${x.date}T${x.time}`));
    const fresh = times.filter((t) => !keys.has(`${day}T${t}`)).map((time) => ({ date: day, time }));
    setEntries([...entries, ...fresh]);
    setSubmitError(null);
    setSaid(fresh.length ? `Added ${plural(fresh.length, 'time')}.` : 'Those times are already in the list.');
  };
  const remove = (key) => { setEntries(entries.filter((x) => `${x.date}T${x.time}` !== key)); setSaid('Removed.'); };
  const removeDay = (date) => { setEntries(entries.filter((x) => x.date !== date)); setSaid('Removed the day.'); };
  /* "Change" takes an overlapping time out of the list and back into the Add fields, ready to retype. */
  const change = (it) => {
    setEntries(entries.filter((x) => `${x.date}T${x.time}` !== it.key));
    setDay(it.date); setFirst(it.time); setLast(''); setErrors({}); setSubmitError(null);
    setSaid(`${it.campusLabel} is back in the Add fields.`);
    setTimeout(() => { const el = rootRef.current && rootRef.current.querySelectorAll('.gt-fr-post__grid input')[1]; if (el) el.focus(); }, 0);
  };
  const post = async () => {
    if (!draft.count) { setSubmitError('Add at least one time.'); return; }
    if (draft.overlaps) {
      setSubmitError(`Nothing is posted yet: remove or change the ${plural(draft.overlaps, 'overlapping time')} first.`);
      const el = rootRef.current && rootRef.current.querySelector('.gt-fr-post__item--overlap .gt-fr-post__change');
      if (el) el.focus();
      return;
    }
    if (draft.overLimit) { setSubmitError(`You can post up to ${SLOT_POST_MAX} times at once. Remove ${draft.overLimit}.`); return; }
    setBusy(true); setSubmitError(null);
    try { if (onPost) await onPost(draft.payload, draft); setEntries([]); }
    catch (err) { setSubmitError((err && err.message) || 'Couldn’t post these times. Check the list and try again.'); }
    finally { setBusy(false); }
  };

  const viewerHint = preview && preview.viewerLabel ? ` · ${preview.viewerLabel} for you` : '';
  return (
    <Drawer open={open} onClose={onClose} portal={portal} width={width} closeDisabled={busy} title="Post slots" className="gt-fr-post-drawer"
      subtitle={`Times are on the campus clock (${campus}). Each slot lasts 1 hour.`}
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={post} loading={busy} loadingLabel="Posting…">{draft.fresh ? `Post ${plural(draft.fresh, 'slot')}` : 'Post slots'}</Button>
        </>
      )}>
      <div className="gt-fr-post" ref={rootRef}>
        <fieldset className="gt-fr-post__add">
          <legend className="gt-fr-post__legend">Add times</legend>
          <div className="gt-fr-post__grid">
            <Input label="Day" type="date" value={day} onChange={(e) => { setDay(e.target.value); setErrors({ ...errors, day: null }); }} error={errors.day} className="gt-fr-post__day" />
            <Input label="First start" type="time" step={900} value={first} onChange={(e) => { setFirst(e.target.value); setErrors({ ...errors, first: null, last: null }); }} error={errors.first}
              helperText={`Campus time (${campus})${viewerHint}`} />
            <Input label="Last start" optional type="time" step={900} value={last} onChange={(e) => { setLast(e.target.value); setErrors({ ...errors, last: null }); }} error={errors.last}
              helperText="Every hour from the first start" />
          </div>
          <div className="gt-fr-post__add-row">
            <Button size="sm" variant="secondary" iconLeft={<FinalReviewsIcon name="plus" size={15} />} onClick={add}>Add times</Button>
            <span className="gt-fr-post__hint">Leave the last start empty to add one time.</span>
          </div>
        </fieldset>
        <span className="gt-fr-post__sr" aria-live="polite">{said}</span>

        <div className="gt-fr-post__review">
          <h3 className="gt-fr-post__heading">To post <span className="gt-fr-post__count">{draft.count ? `${plural(draft.fresh, 'new slot')}${draft.posted ? ` · ${draft.posted} already posted` : ''}` : 'nothing yet'}</span></h3>
          {draft.overlaps > 0 && (
            <Alert tone="error" title={`${plural(draft.overlaps, 'time')} overlap${draft.overlaps === 1 ? 's' : ''} another slot`}>
              Slots never overlap: reviews don’t run in parallel, and every review uses the one shared Zoom room. Remove each marked time, or change it to a start at least an hour from the slot it names. Nothing posts until then.
            </Alert>
          )}
          {draft.past > 0 && <Alert tone="info">{`${plural(draft.past, 'time has', 'times have')} already passed. Teams can’t book a slot that has started, but you can place a team on it to record a review held outside the app.`}</Alert>}
          {draft.posted > 0 && <p className="gt-fr-post__note">{plural(draft.posted, 'time')} already {draft.posted === 1 ? 'has' : 'have'} a slot, so {draft.posted === 1 ? 'it’s' : 'they’re'} skipped.</p>}
          {submitError && <Alert tone="error">{submitError}</Alert>}
          {draft.count === 0 ? (
            <p className="gt-fr-post__empty">Add a day above. Typical: two to five days with five to eight hourly starts each.</p>
          ) : (
            <div className="gt-fr-post__days">
              {draft.days.map((d) => (
                <section key={d.date} className="gt-fr-post__daygroup" aria-label={d.label}>
                  <div className="gt-fr-post__dayhead">
                    <span className="gt-fr-post__dayname">{d.label}</span>
                    <span className="gt-fr-post__daycount">{plural(d.items.length, 'time')}</span>
                    <Button size="sm" variant="ghost" onClick={() => removeDay(d.date)} aria-label={`Remove ${d.label}`}>Remove day</Button>
                  </div>
                  <ul className="gt-fr-post__items">
                    {d.items.map((it) => (
                      <li key={it.key} className={['gt-fr-post__item', it.posted ? 'gt-fr-post__item--posted' : '', !it.posted && it.overlaps.length ? 'gt-fr-post__item--overlap' : ''].filter(Boolean).join(' ')}>
                        <time className="gt-fr-post__time" dateTime={it.startsAt}>{it.campusLabel}</time>
                        {differs && <span className="gt-fr-post__viewer">{it.viewerLabel} for you</span>}
                        <span className="gt-fr-post__flags">
                          {it.posted && <Badge tone="neutral">Already posted</Badge>}
                          {!it.posted && it.overlaps.length > 0 && <Badge tone="error">Overlaps {it.overlaps.join(', ')}</Badge>}
                          {!it.posted && it.past && <Badge tone="neutral">In the past</Badge>}
                          {!it.posted && it.overlaps.length > 0 && (
                            <Button size="sm" variant="ghost" className="gt-fr-post__change" onClick={() => change(it)} aria-label={`Change ${it.campusLabel} on ${d.label}`}>Change</Button>
                          )}
                        </span>
                        <IconButton size="sm" ariaLabel={`Remove ${it.campusLabel} on ${d.label}`} tooltip="Remove" onClick={() => remove(it.key)}>
                          <FinalReviewsIcon name="x" size={15} />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
