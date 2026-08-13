import * as React from 'react';

export interface AIDraftButtonProps {
  /** @default 'Draft with AI' */
  children?: React.ReactNode;
  /** Spinner + "Drafting…". @default false */
  loading?: boolean;
  disabled?: boolean;
  /** @default 'md' */
  size?: 'sm' | 'md';
  onClick?: () => void;
  className?: string;
}

/** Sparkle ghost button that triggers LLM drafting of a story/task. */
export function AIDraftButton(props: AIDraftButtonProps): React.JSX.Element;
