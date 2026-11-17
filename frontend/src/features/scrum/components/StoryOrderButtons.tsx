import { ChevronDown, ChevronUp } from 'lucide-react';
import { IconButton } from '@components/IconButton/IconButton';
import type { StoryOrderControl } from '../scrumTypes';
import './StoryOrderButtons.scss';

interface Props {
  storyId: string;
  /** "US-3": the buttons' names say which story they move. */
  storyKey: string;
  control: StoryOrderControl;
  className?: string;
}

/**
 * Move up and Move down for one story of a list (a sprint's, or the backlog's), beside its card or
 * row: the keyboard and pointer way to set the team's priority order (there is no drag). Each is off
 * at its end of the list. While the list's new order saves they stay enabled and focusable, marked
 * `aria-disabled`, and ignore clicks: a disabled button would drop the focus the page puts back on
 * the moved story. `data-order-story` and `data-direction` let the page find them again.
 */
export default function StoryOrderButtons({ storyId, storyKey, control, className = '' }: Props) {
  const { onMove, first, last, busy = false } = control;
  return (
    <span className={['story-order', className].filter(Boolean).join(' ')} data-order-story={storyId}>
      <IconButton
        size="sm"
        ariaLabel={`Move ${storyKey} up`}
        tooltip="Move up"
        // Each bubble on its own side, clear of the other button in a column.
        tooltipSide="top"
        data-direction="up"
        disabled={first}
        aria-disabled={busy || undefined}
        onClick={() => { if (!busy) onMove('up'); }}
      >
        <ChevronUp size={14} />
      </IconButton>
      <IconButton
        size="sm"
        ariaLabel={`Move ${storyKey} down`}
        tooltip="Move down"
        tooltipSide="bottom"
        data-direction="down"
        disabled={last}
        aria-disabled={busy || undefined}
        onClick={() => { if (!busy) onMove('down'); }}
      >
        <ChevronDown size={14} />
      </IconButton>
    </span>
  );
}
