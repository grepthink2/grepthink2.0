import React, { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { api, type ApiConversationSummary } from '@/lib/api';
import { emailToDisplayName } from '@features/app/utils/memberUtils';
import { useConversationMessages } from '../hooks/useConversationMessages';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { InitialsAvatar } from './InitialsAvatar';
import { ConversationMenu } from './ConversationMenu';
import { Skeleton } from '@/components/Skeleton/Skeleton';

/** A few alternating bubble placeholders shown while the thread loads. */
const THREAD_SKELETON_BUBBLES: Array<{ mine: boolean; width: number }> = [
  { mine: false, width: 180 },
  { mine: true, width: 140 },
  { mine: false, width: 220 },
  { mine: true, width: 90 },
  { mine: false, width: 160 },
];

interface Props {
  /** The conversation summary from the inbox cache. */
  conversation: ApiConversationSummary;
  /** Called after the thread is deleted via the header menu. */
  onDeleted?: () => void;
  /** Override the avatar size used in the header. Default 51 (page);
   *  widget passes 32. */
  headerAvatarSize?: number;
  /** When true, the thread's own header is hidden — used inside the
   *  floating widget where the popover provides its own header. */
  hideHeader?: boolean;
}

export const ConversationThread: React.FC<Props> = ({
  conversation,
  onDeleted,
  headerAvatarSize = 51,
  hideHeader = false,
}) => {
  const { user } = useAuth();
  const { messages, loading, addOptimisticMessage, confirmOptimistic, dropOptimistic } =
    useConversationMessages(conversation.id);
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

  const otherFirst = conversation.other_user?.first_name?.trim() ?? '';
  const otherLast = conversation.other_user?.last_name?.trim() ?? '';
  const otherName =
    `${otherFirst} ${otherLast}`.trim() ||
    (conversation.other_user?.email
      ? emailToDisplayName(conversation.other_user.email)
      : 'Unknown');

  const handleSend = async (body: string) => {
    // DM-only for now (F1 keeps runtime behavior unchanged for DMs; team
    // channel send goes through conversationId in a later task).
    const otherUserId = conversation.other_user?.id;
    if (!otherUserId) return;
    const tempId = `temp-${Date.now()}`;
    addOptimisticMessage({
      id: tempId,
      sender_id: user!.id,
      body,
      created_at: new Date().toISOString(),
    });
    try {
      const res = await api.sendMessage({ toUserId: otherUserId, body });
      confirmOptimistic(tempId, res.message);
    } catch (err) {
      // Strip the optimistic message on failure so the thread reflects truth.
      dropOptimistic(tempId);
      throw err;
    }
  };

  return (
    <div className="messages-thread">
      {!hideHeader && (
        <header className="messages-thread__header">
          <div className="messages-thread__header-left">
            <InitialsAvatar
              email={conversation.other_user?.email}
              name={otherName}
              imageUrl={conversation.other_user?.image_url}
              size={headerAvatarSize}
            />
            <h2 className="messages-thread__title">{otherName}</h2>
          </div>
          <ConversationMenu
            conversationId={conversation.id}
            onDeleted={onDeleted}
            alwaysVisible
          />
        </header>
      )}

      <div className="messages-thread__scroll" ref={scrollRef}>
        {loading && messages.length === 0 ? (
          <div className="messages-thread__skeleton" aria-busy="true">
            {THREAD_SKELETON_BUBBLES.map((b, i) => (
              <Skeleton
                key={i}
                width={b.width}
                height={36}
                radius={10}
                style={{ alignSelf: b.mine ? 'flex-end' : 'flex-start' }}
              />
            ))}
          </div>
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
