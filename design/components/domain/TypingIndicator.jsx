import React from 'react';

/**
 * Typing indicator — three pulsing dots inside a received-bubble shape.
 * `tone="app"` matches MessageBubble (white, hairline border, 12/4 radius);
 * `tone="soft"` is the landing stage's grey bubble (#f1f3f4, radius 14/4).
 * Reduced motion: dots render static at 60% opacity.
 */
export function TypingIndicator({ tone = 'app', label = 'Someone is typing', className = '' }) {
  return (
    <span
      className={['gt-typing', `gt-typing--${tone}`, className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <i className="gt-typing__dot" /><i className="gt-typing__dot" /><i className="gt-typing__dot" />
    </span>
  );
}
