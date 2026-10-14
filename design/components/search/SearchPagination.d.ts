import * as React from 'react';

export interface SearchPaginationProps {
  page: number;
  pages: number;
  /** 1-based index of the first/last visible result. */
  from: number;
  to: number;
  total: number;
  onChange?: (page: number) => void;
  className?: string;
}

export function SearchPagination(props: SearchPaginationProps): React.JSX.Element | null;
