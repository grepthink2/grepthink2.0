import * as React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'onClick'> {
  children?: React.ReactNode;
  /** Replaces the default title / subtitle block. */
  header?: React.ReactNode;
  footer?: React.ReactNode;
  /** Visible heading (not the HTML tooltip attribute — the card never forwards it). Required for an interactive card: it becomes the link / button. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right side of the header (IconButtons, a Menu trigger, a small Button). */
  actions?: React.ReactNode;
  /** Heading element for the title. @default 'h3' */
  titleAs?: 'h2' | 'h3' | 'h4' | 'p';
  /** @default 'card' */
  shadow?: 'card' | 'hairline' | 'none';
  /** 1px border, no shadow, radius 7, 12×14 padding — cards inside a card or a list. @default false */
  bordered?: boolean;
  /** Makes the card a link (stretched over the card from the title). */
  href?: string;
  /** Makes the card a button (stretched from the title). */
  onClick?: () => void;
  /** Selected border (2px inset green); with `onClick` also sets `aria-pressed`. */
  selected?: boolean;
  /** @default true */
  padded?: boolean;
}

/** Standard white surface. */
export function Card(props: CardProps): React.JSX.Element;
