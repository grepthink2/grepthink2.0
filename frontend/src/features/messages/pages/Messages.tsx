import React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useConversations } from '../hooks/useConversations';
import { ConversationList } from '../components/ConversationList';
import { ConversationThread } from '../components/ConversationThread';
import { NewConversationCompose } from '../components/NewConversationCompose';
import './Messages.scss';

/**
 * Two-pane messaging view.
 *
 * Left: inbox (always visible).
 * Right: depends on URL —
 *   /app/messages                    → "Select a conversation" placeholder
 *   /app/messages/:conversationId    → open thread
 *   /app/messages/compose?to=...     → new-conversation composer
 */
const Messages: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const location = useLocation();
  const { conversations, loading } = useConversations();

  const isCompose = location.pathname.endsWith('/messages/compose');
  const activeConversation = conversationId
    ? conversations.find(c => c.id === conversationId)
    : undefined;

  return (
    <div className="messages-page">
      <aside className="messages-page__list">
        <ConversationList conversations={conversations} loading={loading} />
      </aside>
      <main className="messages-page__thread">
        {isCompose ? (
          <NewConversationCompose />
        ) : activeConversation ? (
          <ConversationThread conversation={activeConversation} />
        ) : conversationId ? (
          // URL has an id but it's not in our inbox — could be a stale link,
          // a non-participant tried to open it, or the inbox hasn't loaded yet.
          <div className="messages-thread messages-thread--empty">
            {loading ? 'Loading…' : 'Conversation not found.'}
          </div>
        ) : (
          <div className="messages-thread messages-thread--empty">
            Select a conversation to start reading.
          </div>
        )}
      </main>
    </div>
  );
};

export default Messages;
