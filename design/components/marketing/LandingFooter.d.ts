import * as React from 'react';

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface LandingFooterProps {
  /** Logo URL (rendered white via invert filter). */
  logoSrc?: string;
  /** @default 'Think in teams.' */
  tagline?: string;
  /** Defaults to Product (Get started · Solutions · Scrum board · Messaging · Project assistant), Account, Company. */
  columns?: FooterColumn[];
  year?: number;
  /** Tighter padding for previews. @default false */
  compact?: boolean;
  className?: string;
}

export function LandingFooter(props: LandingFooterProps): React.JSX.Element;
