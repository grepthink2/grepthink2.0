/**
 * Bucketed relative time, matching the spec (§1):
 *   < 1 min   → "Just now"
 *   < 1 hour  → "{N} Min"
 *   < 24h     → "{N} Hours"
 *   < 7 days  → "{N} Days"
 *   ≥ 7 days  → "Apr 24" (year only if not current year)
 */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} Min`;
  if (diffHour < 24) return `${diffHour} Hours`;
  if (diffDay < 7) return `${diffDay} Days`;

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
