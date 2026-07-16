import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useConversations } from '../hooks/useConversations';
import { MessageComposer } from './MessageComposer';

/**
 * The right-pane view when a user clicked Message on a project page for
 * someone they have no existing conversation with. On first send, the
 * backend creates the conversation and we navigate into it.
 */
export const NewConversationCompose: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refetch: refetchInbox } = useConversations();

  const toUserId = params.get('to');
  const toUserName = params.get('name') || 'this user';

  if (!toUserId) {
    return (
      <div className="messages-thread messages-thread--empty">
        Missing recipient. Go back to the project page and click Message again.
      </div>
    );
  }

  const handleSend = async (body: string) => {
    const res = await api.sendMessage({ toUserId, body });
    await refetchInbox();
    navigate(`/app/messages/${res.conversation_id}`, { replace: true });
  };

  return (
    <div className="messages-thread">
      <header className="messages-thread__header">
        <h2 className="messages-thread__title">{toUserName}</h2>
        <p className="messages-thread__subtitle">Starting a new conversation</p>
      </header>
      <div className="messages-thread__scroll messages-thread__empty">
        Send the first message below.
      </div>
      <MessageComposer onSend={handleSend} />
    </div>
  );
};
