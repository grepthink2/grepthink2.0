import * as React from 'react';
import type { SearchItem, SearchEntityType } from './SearchModel';

export interface CommandPaletteProps {
  /** Controlled visibility. */
  open: boolean;
  onClose: () => void;
  /** Called by the ⌘K / Ctrl+K hotkey when the palette is closed. */
  onOpen?: () => void;
  /** Register the global ⌘K / Ctrl+K toggle. @default true */
  hotkey?: boolean;
  /** Local source — ranked client-side. */
  items?: SearchItem[];
  /** Async source (Supabase RPC). Debounced 250ms; previous results stay visible while loading. */
  onSearch?: (query: string, scope: SearchEntityType | 'all') => Promise<SearchItem[]>;
  /** Shown when the query is empty (last 5–8 visited entities). */
  recent?: SearchItem[];
  /** Receives the chosen item and the route from `routeFor` (null when the codebase has no route yet). */
  onSelect?: (item: SearchItem, route: string | null) => void;
  /** Picks role-dependent routes (assignments, classes). @default 'student' */
  role?: 'student' | 'ta' | 'instructor';
  /** @default 8 */
  pageSize?: number;
  /** @default 'Search people, teams, projects, tasks…' */
  placeholder?: string;
  /** Scope chips to offer; defaults to every entity type. */
  scopes?: SearchEntityType[];
  initialQuery?: string;
  /** Render in place without joining the dialog stack (galleries): no focus move, trap or scroll lock. @default false */
  inline?: boolean;
  className?: string;
}

/**
 * Global ⌘K search dialog: input + scope chips + ranked, paginated results.
 * @startingPoint section="Search" subtitle="⌘K global search with ranked, paginated results" viewport="700x520"
 */
export function CommandPalette(props: CommandPaletteProps): React.JSX.Element | null;
/** Global ⌘K / Ctrl+K listener; call `onToggle` on the chord. */
export function usePaletteHotkey(onToggle: () => void, opts?: { enabled?: boolean }): void;
