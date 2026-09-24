import React from 'react';
import './Assistant.scss';

export interface AssistantIconProps extends React.SVGAttributes<SVGSVGElement> {
  /** @default 16 */
  size?: number;
  /** 'spark' is the chosen mark; 'merge' is the design's runner-up, kept for comparison. */
  variant?: 'spark' | 'merge';
  /** Accessible title; omit for decorative use (the icon is then aria-hidden). */
  title?: string;
}

/**
 * The Project assistant's mark: a four-point spark drawn in Lucide's line idiom (24 viewBox,
 * 2px stroke, round caps) so it sits evenly beside the app's other icons. The 'merge' variant
 * (a merge line ending in a check) lost because at 16px it reads as a PR state.
 */
export const AssistantIcon: React.FC<AssistantIconProps> = ({
  size = 16,
  variant = 'spark',
  title,
  className,
  ...rest
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={['gt-asst-icon', className].filter(Boolean).join(' ')}
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : undefined}
    {...rest}
  >
    {title && <title>{title}</title>}
    {variant === 'merge' ? (
      <>
        <circle cx="6" cy="5" r="2.5" />
        <path d="M6 7.5v6.5a4 4 0 0 0 4 4h2" />
        <path d="m13.5 16.5 2.5 2.5L21 13" />
      </>
    ) : (
      <>
        <path d="M11 4c.5 3.9 3.1 6.5 7 7-3.9.5-6.5 3.1-7 7-.5-3.9-3.1-6.5-7-7 3.9-.5 6.5-3.1 7-7Z" />
        <path d="M19 3v4M17 5h4" />
      </>
    )}
  </svg>
);

export interface AssistantMarkProps {
  /** sm 20px, md 26px, lg 34px tile. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spark' | 'merge';
  className?: string;
}

const MARK_ICON_SIZE = { sm: 13, md: 15, lg: 18 } as const;

/** The mark in a green-50 tile: the assistant's stand-in for a person's avatar. */
export const AssistantMark: React.FC<AssistantMarkProps> = ({
  size = 'md',
  variant = 'spark',
  className,
}) => (
  <span
    className={['gt-asst-mark', `gt-asst-mark--${size}`, className].filter(Boolean).join(' ')}
    aria-hidden="true"
  >
    <AssistantIcon size={MARK_ICON_SIZE[size]} variant={variant} />
  </span>
);
