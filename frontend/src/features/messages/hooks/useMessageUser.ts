import { useNavigate } from 'react-router-dom';
import { useConversations } from './useConversations';

/**
 * Opens a direct message to a person: the conversation the two already have when the inbox holds
 * one, or the compose view, which creates it on the first send.
 */
export function useMessageUser(): (toUserId: string, toUserName?: string | null) => void {
  const navigate = useNavigate();
  const { conversations } = useConversations();

  return (toUserId, toUserName) => {
    // Direct messages only, by design: `other_user` is null on a team channel, so one never
    // matches here. Do not "fix" this to scan participants.
    const existing = conversations.find((c) => c.other_user?.id === toUserId);
    if (existing) {
      navigate(`/app/messages/${existing.id}`, { viewTransition: true });
      return;
    }
    const params = new URLSearchParams({ to: toUserId });
    if (toUserName) params.set('name', toUserName);
    navigate(`/app/messages/compose?${params.toString()}`, { viewTransition: true });
  };
}
