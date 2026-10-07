import { useRef } from 'react';
import type { AnalyticsBoardStatus, AnalyticsUnit } from '@/lib/api/types';
import { compactNumber } from '../utils/analyticsFormat';
import { useMeasuredWidth } from '../utils/useMeasuredWidth';
import { ChartLegend } from './ChartLegend';

export interface StackedRow { key: string; label: string; teams?: number; segments: { status: AnalyticsBoardStatus; count: number; points: number }[] }
export interface StackedBarsProps { rows: StackedRow[]; unit: AnalyticsUnit; onRowClick?: (key: string) => void }

const STATUS_LABEL: Record<AnalyticsBoardStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const ORDER: AnalyticsBoardStatus[] = ['todo', 'in_progress', 'done'];
const UNIT_LABEL: Record<AnalyticsUnit, string> = { count: 'tasks', points: 'points' };
/** `.gt-stack__row`'s 140px label column and its 12px gap: the bars' track is the rest of the width. */
const LABEL_COLUMN = 152;
/** An 11px semibold Poppins digit is at most 7.1px; a figure goes inside its segment only with 4px of padding on each side. */
const CHAR_WIDTH = 7.2;
const LABEL_PADDING = 8;

/** The live board by sprint ordinal (brief §4 #7). Row widths are shares of the largest row; colours follow the board and never change with the unit. A figure sits inside its segment only when it fits there (the track is measured), else in the segment's title; the row's aria-label carries every figure. The markup is all spans, so a clickable row is valid inside its button. */
export function StackedBars({ rows, unit, onRowClick }: StackedBarsProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const track = useMeasuredWidth(wrapRef, 600, LABEL_COLUMN) - LABEL_COLUMN; // floored at the label column: never negative, never wider than it is
  const value = (s: { count: number; points: number }) => (unit === 'count' ? s.count : s.points);
  const totals = rows.map((r) => r.segments.reduce((a, s) => a + value(s), 0));
  const max = Math.max(1, ...totals);
  return (
    <div ref={wrapRef} className="gt-stack">
      {rows.map((row, ri) => {
        const total = totals[ri];
        const parts = ORDER.map((st) => row.segments.find((s) => s.status === st)).filter(Boolean) as StackedRow['segments'];
        const teams = row.teams === undefined ? null : `${row.teams} ${row.teams === 1 ? 'team' : 'teams'}`;
        const label = `${row.label}${teams ? `, ${teams}` : ''}, ${UNIT_LABEL[unit]}: ${parts.map((s) => `${value(s)} ${STATUS_LABEL[s.status].toLowerCase()}`).join(', ')}`;
        const Bar = (
          <span className="gt-stack__row" role="img" aria-label={label}>
            <span className="gt-stack__meta">
              <span className="gt-stack__label">{row.label}</span>
              {teams ? <span className="gt-stack__teams">{teams}</span> : null}
            </span>
            <span className="gt-stack__bar" style={{ width: `${(total / max) * 100}%` }}>
              {parts.map((s) => {
                const v = value(s);
                if (v === 0) return null;
                const text = compactNumber(v);
                const fits = (v / max) * track >= text.length * CHAR_WIDTH + LABEL_PADDING;
                return (
                  <span key={s.status} className={`gt-stack__segment gt-status--${s.status}`} style={{ flexGrow: v }} title={`${STATUS_LABEL[s.status]}: ${text}`}>
                    {fits ? <span className="gt-stack__value">{text}</span> : null}
                  </span>
                );
              })}
            </span>
          </span>
        );
        return onRowClick ? (
          <button key={row.key} type="button" className="gt-stack__button" onClick={() => onRowClick(row.key)}>{Bar}</button>
        ) : (
          <div key={row.key}>{Bar}</div>
        );
      })}
      <ChartLegend items={ORDER.map((st) => ({ key: st, label: STATUS_LABEL[st], swatch: 'rect', colorClass: `gt-status--${st}` }))} />
    </div>
  );
}
