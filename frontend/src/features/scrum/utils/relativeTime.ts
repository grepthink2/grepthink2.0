import { formatDistanceToNowStrict } from 'date-fns';

/** "2h ago" for the task audit line; empty string when there is no timestamp. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDistanceToNowStrict(d)} ago`;
}
