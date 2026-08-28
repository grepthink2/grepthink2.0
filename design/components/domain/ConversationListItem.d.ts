import * as React from 'react';

export interface ConversationListItemProps {
  name: string;
  /** Last-message preview, single line. */
  preview?: string;
  /** Relative time ("2m"). */
  time?: string;
  /** Unread count — bold text + green pill when > 0. @default 0 */
  unread?: number;
  active?: boolean;
  /** Green presence dot. @default false */
  online?: boolean;
  onClick?: () => void;
  className?: string;
}

export interface MessageBubbleProps {
  children: React.ReactNode;
  /** Own messages: green, right-aligned. @default false */
  own?: boolean;
  /** Author line for group threads (only when !own). */
  author?: string;
  time?: string;
  className?: string;
}

export interface MessageComposerProps {
  value: string;
  onChange?: (value: string) => void;
  /** Called with trimmed text on Enter or send click. */
  onSend?: (text: string) => void;
  /** @default 'Type a message…' */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export interface UnreadBadgeProps {
  count: number;
  /** Cap shown as "99+". @default 99 */
  max?: number;
  className?: string;
}

export function ConversationListItem(props: ConversationListItemProps): React.JSX.Element;
export function MessageBubble(props: MessageBubbleProps): React.JSX.Element;
export function MessageComposer(props: MessageComposerProps): React.JSX.Element;
export function UnreadBadge(props: UnreadBadgeProps): React.JSX.Element | null;
