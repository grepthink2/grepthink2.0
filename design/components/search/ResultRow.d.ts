import * as React from 'react';
import type { SearchItem } from './SearchModel';

export interface ResultRowProps {
  item: SearchItem;
  /** Query to highlight in the title. */
  query?: string;
  /** Keyboard/mouse active row — the single highlight. */
  active?: boolean;
  /** DOM id for `aria-activedescendant` on the input. */
  id?: string;
  onSelect?: (item: SearchItem) => void;
  /** Mouse move → make this row active. */
  onHover?: () => void;
  className?: string;
}

export interface ResultGroupProps {
  label: string;
  count?: number;
  /** Narrow the palette scope to this type. */
  onSeeAll?: () => void;
}

export function ResultRow(props: ResultRowProps): React.JSX.Element;
export function ResultGroup(props: ResultGroupProps): React.JSX.Element;
