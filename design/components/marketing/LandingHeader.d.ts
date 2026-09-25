import * as React from 'react';

export interface LandingNavLink {
  label: string;
  href: string;
}

export interface LandingHeaderProps {
  /** Logo image URL (rendered white on the dark bar via invert filter). Falls back to a type wordmark. */
  logoSrc?: string;
  /** @default '/' */
  homeHref?: string;
  /** Plain text links before the buttons. @default Features (#scrum-board) · Contact (/contact) */
  links?: LandingNavLink[];
  /** @default '/login' */
  signInHref?: string;
  /** @default 'Sign in' */
  signInLabel?: string;
  /** @default '/select' */
  ctaHref?: string;
  /** @default 'Get started' */
  ctaLabel?: string;
  /** Controlled morph state. Omit to track window scroll automatically. */
  scrolled?: boolean;
  /** Render fixed to the viewport top. `false` = in-flow (galleries). @default true */
  fixed?: boolean;
  /** Scroll depth (px) at which the bar becomes a pill. @default 64 */
  scrollThreshold?: number;
  className?: string;
}

/**
 * Landing header — dark bar → floating translucent pill morph.
 * @startingPoint section="Marketing" subtitle="Landing header: dark bar → pill on scroll" viewport="1200x160"
 */
export function LandingHeader(props: LandingHeaderProps): React.JSX.Element;
