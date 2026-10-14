import React from 'react';
import { ChartTooltip, useChartTip, useMeasure, fmtWeek } from './ChartTooltip.jsx';
import { ChartLegend, AnalyticsIcon } from './ChartLegend.jsx';

export const TIMELINESS_BUCKETS = {
  early: { label: 'Early', icon: 'check-circle' },
  on_time: { label: 'On time', icon: 'check-circle-2' },
  late: { label: 'Late', icon: 'clock' },
  missing: { label: 'Missing', icon: 'x-circle' },
  not_due: { label: 'Not due yet', icon: 'calendar' },
};

const GAP = 2, R = 4;
function segPath(x, w, h, roundEnd) {
  if (w <= 0) return '';
  if (!roundEnd || w < R) return `M${x},0 h${w} v${h} h${-w} Z`;
  return `M${x},0 h${w - R} a${R},${R} 0 0 1 ${R},${R} v${h - 2 * R} a${R},${R} 0 0 1 ${-R},${R} h${-(w - R)} Z`;
}

/**
 * Submission buckets (.gt-timeliness) as 100%-stacked horizontal bars, one row
 * per class (default) or per assignment (when a class is selected). Status
 * palette (.gt-status--early/on_time/late/missing) with icons in the legend;
 * not-due-yet rows show a gray track and an italic due date; the folded
 * "Smaller groups (n)" row is italic, unlinked, with a ⓘ. Ships in sub-project C.
 */
export function TimelinessBars({ rows = [], bucketOrder = ['early', 'on_time', 'late', 'missing', 'not_due'], view = 'chart', maxRows = 12, dense, onRowClick, className = '' }) {
  const [ref, width] = useMeasure(480);
  const { tip, show, hide } = useChartTip();
  const [all, setAll] = React.useState(false);
  const isDense = dense ?? rows.length > 12;
  const shown = all || rows.length <= maxRows ? rows : rows.slice(0, maxRows);
  const h = isDense ? 14 : 20;
  const buckets = bucketOrder.filter((b) => b !== 'not_due');
  const get = (r, k) => r.buckets.find((b) => b.key === k)?.value || 0;
  const hasNotDue = rows.some((r) => r.notDueYet || get(r, 'not_due') > 0);
  const legend = bucketOrder.filter((b) => b !== 'not_due' || hasNotDue)
    .map((b) => ({ key: b, label: TIMELINESS_BUCKETS[b].label, swatch: 'rect', seriesClass: b === 'not_due' ? 'gt-series--gray' : `gt-status--${b}`, icon: TIMELINESS_BUCKETS[b].icon }));
  const tipRows = (r) => bucketOrder.filter((k) => get(r, k) > 0 || k === 'missing').map((k) => ({ key: k, label: TIMELINESS_BUCKETS[k].label, value: `${get(r, k)} · ${r.expected ? Math.round((get(r, k) / r.expected) * 100) : 0}%`, seriesClass: k === 'not_due' ? 'gt-series--gray' : `gt-status--${k}` }));
  const tipNote = (r) => [r.expected ? `${r.expected} expected` : null, r.dueAt ? `Due ${fmtWeek(r.dueAt)}` : null, r.editedLate ? `${r.editedLate} edited late` : null].filter(Boolean).join(' · ');
  const plotLeft = () => (ref.current ? ref.current.offsetLeft : 148);

  if (view === 'table') {
    const byAssignment = rows.some((r) => r.dueAt);
    return (
      <div className="gt-chart-table__wrap">
        <table className="gt-chart-table">
          <thead><tr><th>{byAssignment ? 'Assignment' : 'Class'}</th>{byAssignment && <th>Due</th>}<th className="gt-table__num">Expected</th>{bucketOrder.map((b) => <th key={b} className="gt-table__num">{TIMELINESS_BUCKETS[b].label}</th>)}<th className="gt-table__num">Edited late</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={r.folded ? { fontStyle: 'italic', color: 'var(--gt-text-tertiary)' } : undefined}>
                <td>{r.label}</td>{byAssignment && <td>{r.dueAt ? fmtWeek(r.dueAt) : '—'}</td>}<td className="gt-table__num">{r.expected}</td>
                {bucketOrder.map((b) => <td key={b} className="gt-table__num">{get(r, b)}</td>)}<td className="gt-table__num">{r.editedLate ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={['gt-timeliness', 'gt-plot', isDense ? 'gt-timeliness--dense' : '', className].filter(Boolean).join(' ')}>
      <div className="gt-timeliness__rows" role="list">
        {shown.map((r) => {
          const linked = !r.folded && !r.notDueYet && (r.href || onRowClick);
          const El = linked ? (r.href ? 'a' : 'button') : 'div';
          const cls = ['gt-timeliness__row', r.folded ? 'gt-timeliness__row--folded' : '', r.notDueYet ? 'gt-timeliness__row--notdue' : '', linked ? 'gt-timeliness__row--link' : ''].filter(Boolean).join(' ');
          let cursor = 0;
          const segs = r.notDueYet ? [] : buckets.map((k) => ({ k, v: get(r, k) })).filter((s) => s.v > 0);
          const notDue = get(r, 'not_due');
          const denom = r.expected || segs.reduce((a, s) => a + s.v, 0) || 1;
          const plotW = r.notDueYet ? Math.max(0, width - 72) : width;
          return (
            <El key={r.key} role="listitem" className={cls} href={El === 'a' ? r.href : undefined} onClick={El === 'button' ? () => onRowClick(r) : undefined} type={El === 'button' ? 'button' : undefined}>
              <span className="gt-timeliness__meta">
                <span className="gt-timeliness__label">{r.label}{r.folded && <span className="gt-timeliness__info" title="Fewer than 3 people"><AnalyticsIcon name="info" size={12} /></span>}</span>
                {!r.notDueYet && r.dueAt && <span className="gt-timeliness__due">Due {fmtWeek(r.dueAt)}</span>}
              </span>
              <span className="gt-timeliness__plot" ref={ref}>
                <svg className="gt-timeliness__bar" width={plotW} height={h} role="img" aria-label={r.notDueYet ? `${r.label}: not due yet` : `${r.label}: ${tipRows(r).map((x) => `${x.label} ${x.value}`).join(', ')}`} onMouseLeave={hide}>
                  <rect className="gt-timeliness__track" x="0" y="0" width={plotW} height={h} rx={R} />
                  {segs.map((s, i) => {
                    const w = (s.v / denom) * plotW - (i < segs.length - 1 || notDue ? GAP : 0);
                    const x = cursor; cursor += w + GAP;
                    return (
                      <path key={s.k} className={`gt-timeliness__segment gt-status--${s.k}`} d={segPath(x, Math.max(w, 2), h, i === segs.length - 1 && !notDue)} tabIndex={0}
                        aria-label={`${TIMELINESS_BUCKETS[s.k].label}: ${s.v}`}
                        onMouseEnter={() => show(plotLeft() + x + w / 2, 0, r.label, tipRows(r), { note: tipNote(r) })} onFocus={() => show(plotLeft() + x + w / 2, 0, r.label, tipRows(r), { note: tipNote(r) })} onBlur={hide} />
                    );
                  })}
                </svg>
                {r.notDueYet && <span className="gt-timeliness__notdue">Due {r.dueAt ? fmtWeek(r.dueAt) : '—'}</span>}
              </span>
            </El>
          );
        })}
      </div>
      <div className="gt-timeliness__axis" aria-hidden="true">{['0%', '25%', '50%', '75%', '100%'].map((t) => <span key={t}>{t}</span>)}</div>
      <div className="gt-timeliness__legend">
        <ChartLegend items={legend} />
        {rows.length > maxRows && <button type="button" className="gt-timeliness__more" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all (${rows.length})`}</button>}
      </div>
      {tip && <ChartTooltip {...tip} placement="below" x={tip.x} y={8} />}
    </div>
  );
}
