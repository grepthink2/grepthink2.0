import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useConversations } from '../hooks/useConversations';

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
 * If a conversation with this user already exists in the inbox cache,
 * navigate straight to it. Otherwise navigate to /app/messages/compose
 * which will create the conversation on first send.
 */
export const MessageButton: React.FC<Props> = ({
  toUserId,
  toUserName,
  className,
  children,
}) => {
  const navigate = useNavigate();
  const { conversations } = useConversations();

  const handleClick = () => {
    const existing = conversations.find(c => c.other_user?.id === toUserId);
    if (existing) {
      navigate(`/app/messages/${existing.id}`);
      return;
    }
    const params = new URLSearchParams({ to: toUserId });
    if (toUserName) params.set('name', toUserName);
    navigate(`/app/messages/compose?${params.toString()}`);
  };

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
