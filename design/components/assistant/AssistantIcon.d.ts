import * as React from 'react';

export interface AssistantIconProps extends React.SVGAttributes<SVGSVGElement> {
  /** @default 16 */
  size?: number;
  /** 'spark' is the chosen mark; 'merge' is the documented runner-up. @default 'spark' */
  variant?: 'spark' | 'merge';
  /** Accessible title; omit for decorative use (aria-hidden). */
  title?: string;
}

export interface AssistantMarkProps {
  /** @default 'md' (26px tile) */
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spark' | 'merge';
  className?: string;
}

/** Lucide-style line icon for the Project assistant. */
export function AssistantIcon(props: AssistantIconProps): React.JSX.Element;
/** The mark in its green-50 rounded tile — use where a person would have an avatar. */
export function AssistantMark(props: AssistantMarkProps): React.JSX.Element;
