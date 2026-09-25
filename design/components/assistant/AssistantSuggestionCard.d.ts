import * as React from 'react';

export interface AssistantSuggestionCardProps {
  /** @default 'pending' */
  state?: 'pending' | 'approved' | 'dismissed';
  /** The evidence sentence, e.g. <>PR <b>#41</b> was merged into main.</> Read only in the pending state. */
  evidence?: React.ReactNode;
  /** @default 'Move this task to Done?' */
  question?: React.ReactNode;
  /** Task key shown in the chip and the confirmation line. */
  taskKey?: string;
  taskTitle?: string;
  /** Target column. @default 'Done' */
  target?: string;
  /** @default 'just now' */
  time?: string;
  /** Who approved (confirmation line). @default 'you' */
  approvedBy?: string;
  onApprove?: () => void;
  onDismiss?: () => void;
  /** Shown in the dismissed state when provided. */
  onUndo?: () => void;
  /** 'app' = flat in-app card; 'landing' = floating marketing shell. @default 'app' */
  surface?: 'app' | 'landing';
  className?: string;
  /** Placement styles (stage positioning). */
  style?: React.CSSProperties;
}

/**
 * Assistant-proposed board change with Approve / Dismiss.
 * @startingPoint section="Assistant" subtitle="Suggestion card — pending, approved, dismissed" viewport="700x360"
 */
export function AssistantSuggestionCard(props: AssistantSuggestionCardProps): React.JSX.Element;
