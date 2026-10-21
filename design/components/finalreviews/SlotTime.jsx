import React from 'react';
import { SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';
import { FinalReviewsModel } from './FinalReviewsModel.jsx';

const { fmtSlotWhen } = FinalReviewsModel;

/**
 * A slot's time in the viewer's zone with the campus time visible beside it when the two differ
 * (brief §3.4): "10:30 – 11:30 PM" over "9:00 AM PT on campus" ("Mon 3:00 PM PT on campus" when the
 * campus day differs). Every time is a <time datetime="ISO instant">; the duration reads "1 h" (PT1H).
 * Board rows, Your team's review, the dialogs and the scoring workspace header all use it.
 */
export function SlotTime({
  startsAt, minutes = 60, zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE, withDay = false, dayFormat = 'long',
  withDuration = false, layout = 'stack', className = '',
}) {
  const w = fmtSlotWhen(startsAt, { zone, schoolZone, minutes });
  const campus = w.campus && withDay && w.campusDay ? `${w.campusDay} · ${w.campus.replace(/^[A-Z][a-z]{2} /, '')}` : w.campus;
  return (
    <span className={['gt-fr-time', layout === 'inline' ? 'gt-fr-time--inline' : '', className].filter(Boolean).join(' ')}>
      <span className="gt-fr-time__main">
        {withDay && <><time dateTime={w.key} className="gt-fr-time__day">{dayFormat === 'short' ? w.day : w.dayLong}</time><span className="gt-fr-time__sep" aria-hidden="true">·</span></>}
        <span className="gt-fr-time__range"><time dateTime={w.iso}>{w.startShort}</time> – <time dateTime={w.isoEnd}>{w.end}</time></span>
        {withDuration && <><span className="gt-fr-time__sep" aria-hidden="true">·</span><time className="gt-fr-time__dur" dateTime={w.isoDuration}>{w.duration}</time></>}
      </span>
      {campus && <span className="gt-fr-time__campus"><time dateTime={w.iso}>{campus}</time> on campus</span>}
    </span>
  );
}
