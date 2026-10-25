import React from 'react';

/**
 * The "new" dot (What's new, 2026-10-23): something new to read — release notes — never unread messages.
 * Blue (`--gt-new-dot`: informational under the status rule), 8px, and decorative (`aria-hidden`): the host says
 * what it means from a visually hidden "New release notes" its control is described by (`aria-describedby`), so
 * the control's name never changes ("What's new", "Profile menu"). `ring` draws a 2px ring in the surface behind
 * it (`--gt-new-dot-ring`, default `--gt-surface`) for a dot over an avatar or an icon's corner. Position it, and
 * re-colour the ring for a dark surface, from the host's own class. Not UnreadBadge: that one is red and carries a count.
 */
export function NewDot({ ring = false, className = '', ...rest }) {
  return <span className={['gt-new-dot', ring ? 'gt-new-dot--ring' : '', className].filter(Boolean).join(' ')} aria-hidden="true" {...rest} />;
}
