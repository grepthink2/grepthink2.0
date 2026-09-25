import * as React from 'react';

export interface EyebrowProps {
  children: React.ReactNode;
  /** Badge text before the label, e.g. 'NEW' or 'SOON'. */
  badge?: string;
  /** 'green' (live) or 'amber' (coming soon). @default 'green' */
  tone?: 'green' | 'amber';
  className?: string;
}

export interface MarketingBadgeProps {
  /** @default 'NEW' */
  children?: React.ReactNode;
  /** 'new' = white on #018156; 'soon' = white on #8A5200. @default 'new' */
  tone?: 'new' | 'soon';
  className?: string;
}

export function Eyebrow(props: EyebrowProps): React.JSX.Element;
export function MarketingBadge(props: MarketingBadgeProps): React.JSX.Element;
