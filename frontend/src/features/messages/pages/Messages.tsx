import React from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useConversations } from '../hooks/useConversations';
import { ConversationList } from '../components/ConversationList';
import { ConversationThread } from '../components/ConversationThread';
import { NewConversationCompose } from '../components/NewConversationCompose';
import './Messages.scss';

const Messages: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { conversations, loading } = useConversations();

  const isCompose = location.pathname.endsWith('/messages/compose');
  const activeConversation = conversationId
    ? conversations.find(c => c.id === conversationId)
    : undefined;

  const hasActiveThread = isCompose || !!conversationId;

  return (
    <div className={`messages-page${hasActiveThread ? ' messages-page--thread-active' : ''}`}>
      <aside className="messages-page__list">
        <ConversationList
          conversations={conversations}
          loading={loading}
          activeId={conversationId ?? null}
          onSelect={(id) => navigate(`/app/messages/${id}`, { viewTransition: true })}
        />
      </aside>
      <main className="messages-page__thread">
        <button
          className="messages-page__back-btn"
          onClick={() => navigate('/app/messages', { viewTransition: true })}
          aria-label="Back to conversations"
        >
          <ArrowLeft size={18} />
          All Messages
        </button>
        {isCompose ? (
          <NewConversationCompose />
        ) : activeConversation ? (
          <ConversationThread
            conversation={activeConversation}
            onDeleted={() => navigate('/app/messages', { replace: true, viewTransition: true })}
          />
        ) : conversationId ? (
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
