/** A figure in a tile, a chart label or a legend: shared by StatCard (components/) and the analytics page. */

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "1,284" under 10K, then "10K", "12.9K", "1.3M". Rounds before it picks a unit (999,950 is "1M", not "1000.0K"); a true minus sign; "0", never "-0". */
export function compactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const whole = Math.round(n) || 0;
  const text = Math.abs(whole) < 10_000 ? whole.toLocaleString('en-US') : COMPACT.format(n);
  return text.replace(/^-/, '−');
}
