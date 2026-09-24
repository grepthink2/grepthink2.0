import * as React from 'react';

export interface HeroProps {
  /** Uppercase pill above the title (used when no announcement is on). */
  eyebrow?: React.ReactNode;
  /** An <AnnouncementPill>; when present it replaces the eyebrow. */
  announcement?: React.ReactNode;
  /** First line of the display title (ink). */
  title: React.ReactNode;
  /** Second line, rendered with the green clip-text gradient. */
  titleAccent?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** @default 'Get started' */
  ctaLabel?: string;
  /** @default '/select' */
  ctaHref?: string;
  /** When given, the CTA renders as a button. */
  onCta?: () => void;
  /** @default 'Sign in' */
  signInLabel?: string;
  /** @default '/login' */
  signInHref?: string;
  onSignIn?: () => void;
  /** Decorative layer positioned behind the copy (e.g. <FloatingCards />). */
  decor?: React.ReactNode;
  /** Shorter vertical padding for previews. @default false */
  compact?: boolean;
  className?: string;
}

/**
 * Landing hero with gradient accent title and floating decor layer.
 * @startingPoint section="Marketing" subtitle="Hero — eyebrow, display title, CTA, floating cards" viewport="1200x640"
 */
export function Hero(props: HeroProps): React.JSX.Element;
