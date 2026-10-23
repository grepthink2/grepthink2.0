// Intentional addition: Pagination — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface PaginationProps {
  /** Current 1-based page. @default 1 */
  page: number;
  /** Total pages. @default 1 */
  pageCount: number;
  onChange?: (page: number) => void;
  className?: string;
}

export function Pagination(props: PaginationProps): React.JSX.Element;
