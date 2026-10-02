import { X } from 'lucide-react';
import { tagSlug } from '../config/scrumTags';

interface Props {
  tag: string;
  /** Shows an × and makes the tag removable (used by the task editor). */
  onRemove?: () => void;
}

/** Task tag chip — one of the 10 presets, each with a fixed token-derived pair. */
export default function TagBadge({ tag, onRemove }: Props) {
  return (
    <span className={`gt-tagbadge gt-tagbadge--${tagSlug(tag)}`}>
      {tag}
      {onRemove && (
        <button
          type="button"
          className="gt-tagbadge__remove"
          aria-label={`Remove tag ${tag}`}
          onClick={onRemove}
        >
          <X size={9} strokeWidth={3} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
