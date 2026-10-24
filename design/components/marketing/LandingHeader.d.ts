// Intentional addition: LandingHeader, WhatsNewTab — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface LandingNavLink {
  label: string;
  href: string;
  /** Hidden at ≤ 560px (the code's `landing-header__link--features`): phones scroll into the bands anyway. @default false */
  hideOnPhone?: boolean;
}

export interface LandingHeaderProps {
  /** Logo image URL (rendered white on the dark bar via invert filter). Falls back to a type wordmark. */
  logoSrc?: string;
  /** @default '/' */
  homeHref?: string;
  /** Plain text links before the buttons. @default Features (#scrum-board, hideOnPhone) · Contact (/contact) */
  links?: LandingNavLink[];
  /** @default '/login' */
  signInHref?: string;
  /** @default 'Sign in' */
  signInLabel?: string;
  /** @default '/select' */
  ctaHref?: string;
  /** @default 'Get started' */
  ctaLabel?: string;
  /** Opens the What's new modal; renders the "ⓘ What's new" tab between the first link (Features) and the rest. */
  onWhatsNew?: () => void;
  /** A release this browser has not opened the modal on: the NewDot on the tab, which is then also described as "New release notes". @default false */
  whatsNewUnseen?: boolean;
  /** @default "What's new" */
  whatsNewLabel?: string;
  /** Controlled morph state. Omit to track window scroll automatically. */
  scrolled?: boolean;
  /** Render fixed to the viewport top. `false` = in-flow (galleries). @default true */
  fixed?: boolean;
  /** Scroll depth (px) at which the bar becomes a pill. @default 64 */
  scrollThreshold?: number;
  className?: string;
}

export interface WhatsNewTabProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'aria-label'> {
  /** Opens the modal (Enter, Space, click). */
  onOpen: () => void;
  /** Shows the dot and the "New release notes" description. @default false */
  unseen?: boolean;
  /** The accessible name — never changes. @default "What's new" */
  label?: string;
  className?: string;
}

/**
 * Landing header — dark bar → floating translucent pill morph.
 * @startingPoint section="Marketing" subtitle="Landing header: dark bar → pill on scroll" viewport="1200x160"
 */
export function LandingHeader(props: LandingHeaderProps): React.JSX.Element;
/** The header's "ⓘ What's new" button (`aria-haspopup="dialog"`): link look, icon alone at ≤ 400px, 44px hit area. */
export function WhatsNewTab(props: WhatsNewTabProps): React.JSX.Element;
