import React, { useMemo } from 'react';
import { getInitials } from '@features/app/utils/memberUtils';

interface Props {
  email?: string | null;
  name?: string | null;
  /** Diameter in pixels. Default 51 (matches Figma inbox/thread). Widget uses 40. */
  size?: number;
  className?: string;
}

/**
 * Gray-filled circular avatar with initials. Used wherever a user identity
 * needs a visual marker — inbox rows, thread header, widget rows.
 *
 * No per-user color hashing (deliberate, see spec gap #5): keeps the visual
 * minimal and consistent. Profile photos are explicitly out of scope until
 * `profiles.avatar_url` exists.
 */
export const InitialsAvatar: React.FC<Props> = ({ email, name, size = 51, className }) => {
  const initials = useMemo(
    () => getInitials(name || '', email || ''),
    [name, email],
  );
  // Font size scales with diameter; 18px at size=51 (Figma reference).
  const fontSize = Math.round(size * (18 / 51));
  return (
    <div
      className={`messages-avatar ${className ?? ''}`}
      style={{ width: size, height: size, fontSize }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
};
