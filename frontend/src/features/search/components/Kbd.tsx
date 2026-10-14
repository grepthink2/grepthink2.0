import type { ReactNode } from 'react';

interface KbdProps {
  /** Several keycaps side by side (a chord). */
  keys?: ReactNode[];
  /** One keycap when `keys` is not given. */
  children?: ReactNode;
}

/** Keycap hint: ⌘ K, ↑, ↵, esc. */
export function Kbd({ keys, children }: KbdProps) {
  const list = keys ?? [children];
  return (
    <>
      {list.map((k, i) => (
        <kbd key={i} className="gt-kbd">{k}</kbd>
      ))}
    </>
  );
}
