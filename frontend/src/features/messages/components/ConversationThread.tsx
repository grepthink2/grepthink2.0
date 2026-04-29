import React, { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { api, type ApiConversationSummary } from '@/lib/api';
import { emailToDisplayName } from '@features/app/utils/memberUtils';
import { useConversationMessages } from '../hooks/useConversationMessages';
import { useConversations } from '../hooks/useConversations';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';

interface Props {
  /** The conversation summary from the inbox cache. */
  conversation: ApiConversationSummary;
}

export const ConversationThread: React.FC<Props> = ({ conversation }) => {
  const { user } = useAuth();
  const { messages, loading, refetch } = useConversationMessages(conversation.id);
  const { refetch: refetchInbox } = useConversations();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark read on mount and on every poll tick where new messages arrived.
  useEffect(() => {
    api.markConversationRead(conversation.id).catch(() => {
      // Non-fatal — next mount will retry.
    });
  }, [conversation.id, messages.length]);

  // Auto-scroll to bottom when new messages arrive (only if user is near bottom).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const myLatestSent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === user?.id) return messages[i];
    }
    return null;
  }, [messages, user?.id]);

  const seenAt =
    conversation.other_user_last_read_at &&
    myLatestSent &&
    new Date(conversation.other_user_last_read_at) >= new Date(myLatestSent.created_at)
      ? new Date(conversation.other_user_last_read_at)
      : null;

  const otherName =
    conversation.other_user.name ||
    (conversation.other_user.email
      ? emailToDisplayName(conversation.other_user.email)
      : 'Unknown');

  const handleSend = async (body: string) => {
    await api.sendMessage(conversation.other_user.id, body);
    // Refresh both views: thread + inbox cache (so badge / preview update).
    await Promise.all([refetch(), refetchInbox()]);
  };

  return (
    <div className="messages-thread">
      <header className="messages-thread__header">
        <h2 className="messages-thread__title">{otherName}</h2>
      </header>

      <div className="messages-thread__scroll" ref={scrollRef}>
        {loading && messages.length === 0 ? (
          <div className="messages-thread__loading">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="messages-thread__empty">
            No messages yet. Send the first one below.
          </div>
        ) : (
          messages.map(m => (
            <MessageBubble key={m.id} message={m} isMine={m.sender_id === user?.id} />
          ))
        )}
        {seenAt && (
          <div className="messages-thread__seen">
            Seen{' '}
            {seenAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>

      <MessageComposer
        disabled={!conversation.can_send}
        disabledReason={`You and ${otherName} don't currently share a class. Conversation is read-only.`}
        onSend={handleSend}
      />
    </div>
  );
};
