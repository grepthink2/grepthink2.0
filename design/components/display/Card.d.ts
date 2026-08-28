import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Custom header row (overrides title/subtitle). */
  header?: React.ReactNode;
  /** Footer row with top border (actions). */
  footer?: React.ReactNode;
  /** Simple header title. */
  title?: string;
  subtitle?: string;
  /** 'card' = signature 2.61px shadow · 'hairline' = 1px border + 4px shadow · 'none'. @default 'card' */
  shadow?: 'card' | 'hairline' | 'none';
  /** Pad the body (24/32px). Set false for flush content like tables. @default true */
  padded?: boolean;
}

/**
 * Standard white surface card.
 * @startingPoint section="Primitives" subtitle="Card with header, body & footer" viewport="700x260"
 */
export function Card(props: CardProps): React.JSX.Element;
