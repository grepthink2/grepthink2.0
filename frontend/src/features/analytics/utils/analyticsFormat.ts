/** Number and date formatting for the analytics page. Dates are ISO calendar dates; never shift them through a Date in the viewer's zone. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "1,284" under 10K, then "10K", "12.9K", "1.3M". Rounds before it picks a unit (999,950 is "1M", not "1000.0K"); a true minus sign; "0", never "-0". */
export function compactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const whole = Math.round(n) || 0;
  const text = Math.abs(whole) < 10_000 ? whole.toLocaleString('en-US') : COMPACT.format(n);
  return text.replace(/^-/, '−');
}

export function percent(rate: number | null | undefined, digits = 0): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}

/** A relative change in whole percentage points, the one rounding behind both the figure (`signedPercent`) and the metric card's tone; null without a baseline (null or NaN). */
export function deltaPoints(delta: number | null): number | null {
  if (delta === null || Number.isNaN(delta)) return null;
  return Math.round(delta * 100);
}

/** A relative change: "+18%", "−10%" (true minus sign), "0%"; "—" without a baseline. */
export function signedPercent(delta: number | null | undefined): string {
  const pct = deltaPoints(delta ?? null);
  if (pct === null) return '—';
  if (pct === 0) return '0%';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

export function weekLabel(iso: string): string {
  const { m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

export function dateLabel(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "Sep 8 – Oct 7" within one year, else both years. */
export function rangeLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (a.y === b.y) return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}`;
  return `${dateLabel(from)} – ${dateLabel(to)}`;
}
