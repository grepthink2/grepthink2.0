import { ArrowRight, Clock, GitPullRequest } from 'lucide-react';
import { Avatar } from '@/components/Avatar/Avatar';
import { Tooltip, type TooltipProps } from '@components/Tooltip/Tooltip';
import type { BoardPerson } from '../scrumTypes';
import { prLabel, prState } from '../utils/prLabel';

/** Story-point chip — rounded square, mono numeral. */
export function PointsChip({ points, size = 'md' }: { points: number | string; size?: 'sm' | 'md' }) {
  return (
    <span className={`gt-points gt-points--${size}`} title="Story points">
      {points}
    </span>
  );
}

/** Time-estimate chip — clock glyph + hours ("6h"; a story's is the sum of its tasks'). */
export function EstimateChip({ estimate }: { estimate: string }) {
  return (
    <span className="gt-estimate" title="Time estimate">
      <Clock size={11} aria-hidden="true" />
      {estimate}
    </span>
  );
}

/** Linked PR/MR chip. An unknown state renders gray rather than guessing. */
export function PRLinkChip({ prUrl, provider, state }: { prUrl: string; provider: string | null; state: string | null }) {
  const label = prLabel(prUrl, provider);
  if (!label) return null;
  const chipState = prState(state);
  return (
    <a
      className={`gt-prchip gt-prchip--${chipState}`}
      href={prUrl}
      target="_blank"
      rel="noreferrer"
      title={`${provider === 'gitlab' ? 'Merge request' : 'Pull request'} · ${state ?? 'state unknown'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <GitPullRequest size={11} aria-hidden="true" />
      {label}
    </a>
  );
}

/** Reporter → assignee pair (tiny avatars with an arrow). */
/**
 * Reporter → assignee avatars. Hovering either names the person with the design
 * system's Tooltip, which shows at once; the browser's `title` waited about a second.
 * `tooltipSide` exists for rows inside a clipping container (the backlog), where a
 * bubble above the first row would be cut off.
 */
export function UserPair({
  reporter, assignee, size = 'xs', tooltipSide = 'top',
}: {
  reporter: BoardPerson;
  assignee: BoardPerson;
  /** xs 20px on cards and rows; sm 28px in the story modal. @default 'xs' */
  size?: 'xs' | 'sm';
  tooltipSide?: TooltipProps['side'];
}) {
  // Not focusable, and the avatars decorative: cards are buttons (or draggable cards),
  // and the bubble's text already names each person in the card's accessible name.
  return (
    <span className="gt-userpair">
      <Tooltip content={`Reporter: ${reporter.name}`} side={tooltipSide} focusable={false}>
        <Avatar name={reporter.name} src={reporter.image_url ?? undefined} size={size} decorative />
      </Tooltip>
      <ArrowRight size={10} aria-hidden="true" />
      <Tooltip content={`Assignee: ${assignee.name}`} side={tooltipSide} focusable={false}>
        <Avatar name={assignee.name} src={assignee.image_url ?? undefined} size={size} decorative />
      </Tooltip>
    </span>
  );
}
