import React from 'react';
import { Badge } from '../display/Badge.jsx';
import { Button } from '../primitives/Button.jsx';
import { Input } from '../primitives/Input.jsx';
import { Skeleton } from '../feedback/EmptyState.jsx';
import { FinalReviewsModel } from './FinalReviewsModel.jsx';
import { FinalReviewsIcon } from './FinalReviewsIcon.jsx';

const { countsText, reviewingText, isStaffLens } = FinalReviewsModel;
const isHttpUrl = (s) => { try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };

/**
 * The shared Zoom room for every review in the class. TAs read it; the instructor sets, edits or
 * clears it inline (Esc cancels). Students never see this — their room arrives with their own booking.
 */
export function ZoomRoomField({ zoomUrl = null, canEdit = false, onSave, saving = false, defaultEditing = false, className = '' }) {
  const [editing, setEditing] = React.useState(defaultEditing);
  const [draft, setDraft] = React.useState(zoomUrl || '');
  const [error, setError] = React.useState(null);
  const formRef = React.useRef(null);
  const focusInput = () => { const el = formRef.current && formRef.current.querySelector('input'); if (el) el.focus(); };
  const start = () => { setDraft(zoomUrl || ''); setError(null); setEditing(true); };
  React.useEffect(() => { if (editing && !defaultEditing) focusInput(); }, [editing, defaultEditing]);
  const save = async (value) => {
    const v = value.trim();
    if (v && !isHttpUrl(v)) { setError('Enter the full link, like https://ucsc.zoom.us/j/…'); focusInput(); return; }
    try { if (onSave) await onSave(v || null); setEditing(false); } catch { setError('Couldn’t save the room. Try again.'); }
  };
  return (
    <div className={['gt-fr-zoom', editing ? 'gt-fr-zoom--editing' : '', className].filter(Boolean).join(' ')}>
      {editing ? (
        <form ref={formRef} className="gt-fr-zoom__form" noValidate onSubmit={(e) => { e.preventDefault(); save(draft); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}>
          <Input label="Shared Zoom room" type="url" value={draft} onChange={(e) => { setDraft(e.target.value); setError(null); }} placeholder="https://ucsc.zoom.us/j/…"
            error={error} helperText="Every review in the class uses this room." disabled={saving} className="gt-fr-zoom__input" />
          <div className="gt-fr-zoom__buttons">
            <Button type="submit" size="sm" loading={saving} loadingLabel="Saving…">Save</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            {zoomUrl && <Button size="sm" variant="danger-ghost" onClick={() => save('')} disabled={saving}>Clear room</Button>}
          </div>
        </form>
      ) : (
        <>
          <span className="gt-fr-zoom__label"><FinalReviewsIcon name="video" size={15} />Shared Zoom room</span>
          {zoomUrl ? <a className="gt-fr-zoom__link" href={zoomUrl} target="_blank" rel="noreferrer">{zoomUrl}</a> : <span className="gt-fr-zoom__none">Not set yet. Every review uses one shared room.</span>}
          {canEdit && <Button size="sm" variant="ghost" onClick={start} iconLeft={<FinalReviewsIcon name={zoomUrl ? 'pencil' : 'plus'} size={14} />}>{zoomUrl ? 'Edit' : 'Set Zoom room'}</Button>}
        </>
      )}
    </div>
  );
}

/**
 * The board's summary bar: the sign-ups state (every lens), the counts, "You're the Review TA for n teams"
 * (TA), the shared Zoom room (staff), and the instructor's Post slots and Open / Close sign-ups with
 * what the switch does, said where it's flipped. A complete class reads as read-only.
 */
export function FinalReviewsHeader({
  lens = 'no_team', signupsOpen = false, counts = { slots: 0, booked: 0, free: 0, unbooked: 0, noReviewTa: 0 }, myReviewCount = 0, zoomUrl = null,
  complete = false, status = 'ready', busy = null, onPostSlots, onToggleSignups, onSaveZoom, className = '',
}) {
  const staff = isStaffLens(lens);
  const inst = lens === 'instructor' && !complete;
  if (status === 'loading') {
    return (
      <section className={['gt-fr-head', 'gt-fr-head--loading', className].filter(Boolean).join(' ')} aria-busy="true">
        <div className="gt-fr-head__top"><div className="gt-fr-head__state"><Skeleton width={112} height={22} radius={20} /><Skeleton width={220} height={13} /></div></div>
      </section>
    );
  }
  const help = !inst ? null
    : signupsOpen && !counts.slots ? 'Sign-ups are open, but no slots are posted, so nobody can book until you post some.'
      : signupsOpen ? 'Product Owners can book, move and release; TAs can sign up to review. You can change anything at any time.'
        : 'Product Owners can’t book, move or release, and TAs can’t sign up. Review TAs can still step down, and you can still change anything.';
  const postPrimary = inst && !counts.slots;
  return (
    <section className={['gt-fr-head', className].filter(Boolean).join(' ')} aria-label="Final reviews summary">
      <div className="gt-fr-head__top">
        <div className="gt-fr-head__state">
          <Badge status={complete ? 'class.complete' : signupsOpen ? 'signups.open' : 'signups.closed'}>{complete ? 'Class complete' : undefined}</Badge>
          {lens === 'ta' && <span className="gt-fr-head__mine">{reviewingText(myReviewCount)}</span>}
        </div>
        {inst && (
          <div className="gt-fr-head__actions">
            <Button size="sm" variant={postPrimary ? 'primary' : 'secondary'} iconLeft={<FinalReviewsIcon name="calendar-plus" size={15} />} onClick={onPostSlots}>Post slots</Button>
            <Button size="sm" variant={!signupsOpen && !postPrimary ? 'primary' : 'secondary'} loading={busy === 'signups'} loadingLabel={signupsOpen ? 'Closing…' : 'Opening…'}
              onClick={() => onToggleSignups && onToggleSignups(!signupsOpen)}>{signupsOpen ? 'Close sign-ups' : 'Open sign-ups'}</Button>
          </div>
        )}
      </div>
      <p className="gt-fr-head__counts">{countsText(counts, lens).map((t) => <span key={t}>{t}</span>)}</p>
      {help && <p className="gt-fr-head__help">{help}</p>}
      {complete && <p className="gt-fr-head__help">This class is complete. The board is read-only.</p>}
      {staff && <ZoomRoomField zoomUrl={zoomUrl} canEdit={inst} onSave={onSaveZoom} saving={busy === 'zoom'} />}
    </section>
  );
}
