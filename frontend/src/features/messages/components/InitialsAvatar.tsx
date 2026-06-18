import React, { useMemo } from 'react';
import { getInitials } from '@features/app/utils/memberUtils';

interface Props {
  email?: string | null;
  name?: string | null;
  /** URL of the user's profile photo (profiles.image_url). Falls back to initials when absent. */
  imageUrl?: string | null;
  /** Diameter in pixels. Default 51 (matches Figma inbox/thread). Widget uses 40. */
  size?: number;
  className?: string;
}

/**
 * Circular avatar that shows a profile photo when available, falling back to
 * initials derived from the user's name or email.
 */
export const InitialsAvatar: React.FC<Props> = ({ email, name, imageUrl, size = 51, className }) => {
  const initials = useMemo(
    () => getInitials(name || '', email || ''),
    [name, email],
  );
  // Font size scales with diameter; 18px at size=51 (Figma reference).
  const fontSize = Math.round(size * (18 / 51));

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name || email || 'User avatar'}
        className={`messages-avatar ${className ?? ''}`}
        style={{ width: size, height: size, objectFit: 'cover' }}
        onError={(e) => {
          // If the image fails to load, swap back to initials div.
          const target = e.currentTarget as HTMLImageElement;
          target.style.display = 'none';
          if (target.nextSibling) (target.nextSibling as HTMLElement).style.display = 'inline-flex';
        }}
      />
    );
  }

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
