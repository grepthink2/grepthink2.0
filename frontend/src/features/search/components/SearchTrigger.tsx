import { Search } from 'lucide-react';
import { modKey } from '../format';
import { Kbd } from './Kbd';
import '../search.scss';

interface SearchTriggerProps {
  onOpen: () => void;
  /** Warm the index before the palette opens (hover / focus). Called with no arguments. */
  onPrefetch?: () => void;
}

/** Header button that opens the ⌘K palette; the old search box's 250 px footprint. */
export function SearchTrigger({ onOpen, onPrefetch }: SearchTriggerProps) {
  const mod = modKey();
  return (
    <button
      type="button"
      className="gt-search-trigger"
      onClick={onOpen}
      onMouseEnter={() => onPrefetch?.()}
      onFocus={() => onPrefetch?.()}
      aria-label={`Search (${mod} K)`}
      aria-haspopup="dialog"
      aria-keyshortcuts={mod === '⌘' ? 'Meta+K' : 'Control+K'}
    >
      <span className="gt-search-trigger__icon"><Search size={18} /></span>
      <span className="gt-search-trigger__label">Search</span>
      <span className="gt-search-trigger__keys"><Kbd keys={[mod, 'K']} /></span>
    </button>
  );
}
