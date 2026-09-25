import * as React from 'react';

export interface TypingIndicatorProps {
  /** 'app' = MessageBubble chrome (white + border); 'soft' = landing-stage grey bubble. @default 'app' */
  tone?: 'app' | 'soft';
  /** Accessible label. @default 'Someone is typing' */
  label?: string;
  className?: string;
}

export function TypingIndicator(props: TypingIndicatorProps): React.JSX.Element;
