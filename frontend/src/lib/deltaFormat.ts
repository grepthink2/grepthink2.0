/** A relative change shown beside a figure: shared by the metric card (app shell) and the analytics page. */

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
