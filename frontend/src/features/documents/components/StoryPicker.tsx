import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@components/Button/Button';
import { Popover } from '@components/Popover/Popover';
import { SearchField } from '@components/SearchField/SearchField';
import type { ApiDocumentStory } from '@/lib/api';
import type { ProjectStoriesStatus } from '../hooks/useProjectStories';

interface StoryPickerProps {
  /** The trigger's words, which also name the panel: "Add a key story". */
  label: string;
  /** The stories it offers: the board's, minus the ones already picked. */
  stories: ApiDocumentStory[];
  status: ProjectStoriesStatus;
  onRetry: () => void;
  onPick: (story: ApiDocumentStory) => void;
  disabled?: boolean;
  /** The id of the text that says why the trigger is off (a list at its limit). */
  describedBy?: string;
}

/** How many matches the panel lists; the search narrows the rest. */
const SHOWN = 50;

const matches = (story: ApiDocumentStory, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || story.key.toLowerCase().includes(q) || story.title.toLowerCase().includes(q);
};

/**
 * Picks one of the board's stories: a trigger that opens a panel with a search over the stories' keys
 * and titles and a list of the matches, each with its sprint (or the backlog). Picking one closes the
 * panel and gives focus back to the trigger, so several can be added in a row; Esc and a click outside
 * close it too.
 */
export default function StoryPicker({ label, stories, status, onRetry, onPick, disabled = false, describedBy }: StoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Focus inside the panel would go down with it, so it goes back to the trigger. Stable, so Popover
  // keeps its listeners.
  const close = useCallback(() => {
    if (document.activeElement?.closest('.story-picker')) triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
    setQuery('');
  }, []);

  const found = useMemo(() => stories.filter((s) => matches(s, query)), [stories, query]);

  let body: ReactNode;
  if (status === 'loading' || status === 'idle') {
    body = <p className="story-picker__note" role="status">Loading the board’s stories…</p>;
  } else if (status === 'error') {
    body = (
      <p className="story-picker__note">
        Couldn’t load the board’s stories.{' '}
        <button type="button" className="story-picker__retry" onClick={onRetry}>Try again</button>
      </p>
    );
  } else if (found.length === 0) {
    body = <p className="story-picker__note">{query.trim() ? 'No story matches.' : 'Every story is picked already.'}</p>;
  } else {
    body = (
      <ul className="story-picker__list">
        {found.slice(0, SHOWN).map((story) => (
          <li key={story.id}>
            <button
              type="button"
              className="story-picker__option"
              onClick={() => {
                onPick(story);
                close();
              }}
            >
              <span className="story-picker__key">{story.key}</span>{' '}
              <span className="story-picker__title">{story.title}</span>{' '}
              <span className="story-picker__where">{story.sprint_name ?? 'Backlog'}</span>
            </button>
          </li>
        ))}
        {found.length > SHOWN && (
          <li className="story-picker__note">{found.length - SHOWN} more: search to narrow them.</li>
        )}
      </ul>
    );
  }

  return (
    <Popover
      open={open}
      onClose={close}
      padded={false}
      anchor={(
        <Button
          ref={triggerRef}
          variant="ghost"
          size="sm"
          iconLeft={<Plus size={14} />}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-describedby={describedBy}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {label}
        </Button>
      )}
    >
      <div className="story-picker" role="dialog" aria-label={label}>
        <SearchField
          label="Search the board’s stories"
          placeholder="Key or title"
          value={query}
          onChange={setQuery}
          compact
          fullWidth
          autoFocus
        />
        {body}
      </div>
    </Popover>
  );
}
