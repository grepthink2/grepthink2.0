import * as React from 'react';

export interface SpotlightBullet {
  /** 17px Lucide-style icon for the green tile. */
  icon?: React.ReactNode;
  text: React.ReactNode;
}

export interface SpotlightProps {
  /** Anchor id (e.g. 'scrum-board'); also labels the section by its heading. */
  id?: string;
  eyebrow?: React.ReactNode;
  /** 'NEW' | 'SOON' */
  badge?: string;
  /** Eyebrow tone. @default 'green' */
  tone?: 'green' | 'amber';
  heading: React.ReactNode;
  /** Trailing words rendered in the green gradient. */
  headingAccent?: React.ReactNode;
  lead?: React.ReactNode;
  bullets?: (SpotlightBullet | React.ReactNode)[];
  /** Staff note box ("For TAs and instructors"). */
  note?: { title?: React.ReactNode; text: React.ReactNode };
  link?: { label: React.ReactNode; href: string };
  /** Which side the stage sits on. @default 'right' */
  side?: 'left' | 'right';
  /** Alternate band background #f8faf9. @default false */
  alt?: boolean;
  /** Top hairline when following a same-color section. @default false */
  hairline?: boolean;
  /** Reveal state; omit for static. */
  reveal?: 'idle' | 'seen' | 'settled';
  /** The <Stage>. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Full-width feature band with text on one side and a decorative stage on the other.
 * @startingPoint section="Marketing" subtitle="Spotlight band — eyebrow, heading, bullets, floating stage" viewport="1200x620"
 */
export function Spotlight(props: SpotlightProps): React.JSX.Element;
