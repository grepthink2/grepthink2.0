import React from 'react';

/* ── Shared chart helpers (imported by every analytics chart) ── */

/** Measures the rendered width of a container (ResizeObserver). */
export function useMeasure(initial = 600) {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(initial);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => { const w = el.getBoundingClientRect().width; if (w) setWidth(w); };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** 1284 → "1,284" · 12900 → "12.9K" · 1300000 → "1.3M". */
export function fmtCompact(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-US');
}

/** 0.82 → "82%". */
export function fmtPct(r, digits = 0) {
  if (r === null || r === undefined || Number.isNaN(r)) return '—';
  return `${(r * 100).toFixed(digits)}%`;
}

/** Signed delta: 0.18 → "+18%". */
export function fmtDelta(r) {
  if (r === null || r === undefined) return null;
  const pct = Math.round(r * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

/** "2026-09-07" → "Sep 7" (adds the year when `withYear`). */
export function fmtWeek(iso, withYear = false) {
  if (!iso) return '';
  return parseIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

/** "Sep 8 – Oct 7" within a year · "Dec 25, 2025 – Jan 5, 2026" across years. */
export function fmtRange(from, to) {
  if (!from || !to) return '';
  const cross = from.slice(0, 4) !== to.slice(0, 4);
  return `${fmtWeek(from, cross)} – ${fmtWeek(to, cross)}`;
}

/** Rounds a max up to a "nice" tick ceiling and returns [max, ticks[]]. */
export function niceScale(max, count = 4) {
  if (!max || max <= 0) return [1, [0, 0.25, 0.5, 0.75, 1]];
  const rough = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return [top, ticks];
}

/** Hover/focus tooltip state for one chart. */
export function useChartTip() {
  const [tip, setTip] = React.useState(null);
  const show = React.useCallback((x, y, title, rows, extra = {}) => setTip({ x, y, title, rows, ...extra }), []);
  const hide = React.useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

/** Formatters exposed on the bundle namespace (lower-case exports stay internal). */
export const ChartFormat = { compact: fmtCompact, pct: fmtPct, delta: fmtDelta, week: fmtWeek, range: fmtRange, niceScale };

/**
 * Tooltip surface (.gt-chart-tip) positioned absolutely inside a `.gt-plot`
 * container. Series are keyed by a short colored line (`seriesClass`, e.g.
 * "gt-series--1"); text only — every value is also in the table twin.
 */
export function ChartTooltip({ x = 0, y = 0, title, rows = [], note, placement = 'above', className = '' }) {
  return (
    <div
      className={['gt-chart-tip', placement === 'below' ? 'gt-chart-tip--below' : '', placement === 'right' ? 'gt-chart-tip--right' : '', className].filter(Boolean).join(' ')}
      style={{ left: x, top: y }}
      role="status"
    >
      {title && <div className="gt-chart-tip__title">{title}</div>}
      {rows.map((r, i) => (
        <div key={r.key || i} className="gt-chart-tip__row">
          {r.seriesClass && <span className={`gt-chart-tip__key ${r.seriesClass}`} aria-hidden="true" />}
          <span className="gt-chart-tip__label">{r.label}</span>
          <span className="gt-chart-tip__value">{r.value}</span>
        </div>
      ))}
      {note && <div className="gt-chart-tip__note">{note}</div>}
    </div>
  );
}
