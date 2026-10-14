import React from 'react';

/** Keycap hint (⌘K, ↑, ↵, esc). Pass `keys` as an array to render a chord. */
export function Kbd({ keys, children, onDark = false, className = '' }) {
  const list = keys || [children];
  const cls = ['gt-kbd', onDark ? 'gt-kbd--on-dark' : '', className].filter(Boolean).join(' ');
  return (
    <React.Fragment>
      {list.map((k, i) => <kbd key={i} className={cls}>{k}</kbd>)}
    </React.Fragment>
  );
}

/** Platform-aware modifier label: ⌘ on Apple devices, Ctrl elsewhere. */
export function modKey() {
  if (typeof navigator === 'undefined') return '⌘';
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
}
/** Bundle-visible alias of modKey (only capitalized exports reach the namespace). */
export const ModKey = modKey;
