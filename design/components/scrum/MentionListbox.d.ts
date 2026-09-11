import * as React from 'react';

export interface MentionMember {
  id?: string | number;
  name: string;
  /** Secondary line — role or email. */
  secondary?: string;
}

export interface MentionListboxProps {
  /** @default true */
  open?: boolean;
  /** Text after the "@" trigger. */
  query?: string;
  /** Local source — filtered client-side. */
  members?: MentionMember[];
  /** Async source (Supabase lookup) — debounced 250ms. */
  onSearch?: (query: string) => Promise<MentionMember[]>;
  /** Insert the mention (fired on click/Enter/Tab in the host). */
  onSelect?: (member: MentionMember) => void;
  /** Side of the caret/composer with room. @default 'below' */
  position?: 'above' | 'below';
  /** Active row (host drives it from ↑/↓). @default 0 */
  activeIndex?: number;
  /** Listbox id — host sets aria-activedescendant={`${id}-opt-${activeIndex}`}. @default 'gt-mentionbox' */
  id?: string;
  /** Force a state for galleries. */
  stateOverride?: 'idle' | 'loading' | 'empty' | 'error';
  className?: string;
}

/**
 * Async-first @mention autocomplete anchored to a composer textarea.
 * All five states designed: idle, loading, results (6 visible, scroll
 * beyond), empty, error (quiet retry).
 */
export function MentionListbox(props: MentionListboxProps): React.JSX.Element | null;
