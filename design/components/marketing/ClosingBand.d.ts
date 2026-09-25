import * as React from 'react';

export interface ClosingBandProps {
  /** @default 'Ready to run your class on grepthink?' */
  heading?: React.ReactNode;
  text?: React.ReactNode;
  /** @default 'Get started' */
  ctaLabel?: string;
  /** @default '/select' */
  ctaHref?: string;
  /** @default 'Talk to us' — pass '' to hide */
  secondaryLabel?: string;
  /** @default '/contact' */
  secondaryHref?: string;
  className?: string;
}

export function ClosingBand(props: ClosingBandProps): React.JSX.Element;
