import React from 'react';
import { useMessageUser } from '../hooks/useMessageUser';

interface Props {
  /** Profile id of the user to message. */
  toUserId: string;
  /** Display name (used to show "Start a conversation with X" on the compose view). */
  toUserName?: string | null;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The single discovery affordance for messaging — used on project pages
 * (project detail "Message owner", per-member buttons, my-project per-
 * requester buttons, instructor view per-student buttons).
 *
 * Where it leads is `useMessageUser`'s: the conversation the two already
 * have, or the compose view.
 */
export const MessageButton: React.FC<Props> = ({
  toUserId,
  toUserName,
  className,
  children,
}) => {
  const message = useMessageUser();
  const handleClick = () => message(toUserId, toUserName);

  return (
    <button
      type="button"
      className={className ?? 'message-btn'}
      onClick={handleClick}
      aria-label={toUserName ? `Message ${toUserName}` : 'Send message'}
    >
      {children ?? 'Message'}
    </button>
  );
};
