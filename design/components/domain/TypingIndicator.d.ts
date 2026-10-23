// Intentional addition: TypingIndicator — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface TypingIndicatorProps {
  /** 'app' = MessageBubble chrome (white + border); 'soft' = landing-stage grey bubble. @default 'app' */
  tone?: 'app' | 'soft';
  /** Accessible label. @default 'Someone is typing' */
  label?: string;
  className?: string;
}

export function TypingIndicator(props: TypingIndicatorProps): React.JSX.Element;
