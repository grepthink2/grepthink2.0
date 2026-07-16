import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { api, type ApiConversationSummary } from '@/lib/api';
import { useConversationMessages } from '../hooks/useConversationMessages';
import { useConversations } from '../hooks/useConversations';
import { conversationTitle } from '../conversationTitle';
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
  const {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlder,
    addOptimisticMessage,
    confirmOptimistic,
    dropOptimistic,
  } = useConversationMessages(conversation.id);
  const { refetch: refetchInbox, optimisticMarkRead } = useConversations();
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // Scroll bookkeeping: initial open lands at the newest message; prepends
  // stay anchored; bottom appends are handled by the nearBottom effect.
  const prevFirstId = useRef<string | null>(null);
  const prevScrollHeight = useRef(0);
  const didInitialScroll = useRef(false);

  useEffect(() => {
    didInitialScroll.current = false;
    prevFirstId.current = null;
    prevScrollHeight.current = 0;
  }, [conversation.id]);

  const isGroup = conversation.type !== 'dm';
  const senderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of conversation.participants) {
      const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Unknown';
      map.set(p.id, name);
    }
    return map;
  }, [conversation.participants]);

  const title = conversationTitle(conversation);

  // Mark read on mount and whenever new messages arrive; also clears the
  // sidebar unread badge immediately instead of waiting on the next inbox
  // refetch. The server call stays unconditional (idempotent); the local
  // clear is gated so it only fires when there is a badge to clear.
  useEffect(() => {
    api.markConversationRead(conversation.id).catch(() => {
      // Non-fatal — next mount will retry.
    });
    if (conversation.unread_count > 0) optimisticMarkRead(conversation.id);
  }, [conversation.id, messages.length, conversation.unread_count, optimisticMarkRead]);

  // Auto-scroll to bottom when new messages arrive (only if user is near bottom).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  // Load older history when the top sentinel scrolls into view.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const scroller = scrollRef.current;
    if (!sentinel || !scroller || !hasMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingOlder) void loadOlder();
    }, { root: scroller, rootMargin: '120px' });
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasMore, loadingOlder, loadOlder]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const firstId = messages[0]?.id ?? null;
    const prevId = prevFirstId.current;

    if (!didInitialScroll.current && !loading && messages.length > 0) {
      // First page landed: open at the newest message. Also keeps the top
      // sentinel out of view so it can't self-trigger a page fetch on open.
      scroller.scrollTop = scroller.scrollHeight;
      didInitialScroll.current = true;
    } else if (
      prevId !== null && firstId !== null && firstId !== prevId &&
      messages.some(m => m.id === prevId)
    ) {
      // Older page prepended (previous first message still present, deeper):
      // keep the viewport anchored. A bottom append never changes the first
      // id, so realtime arrivals can't consume the anchor (the race the
      // review found), and a reconnect reload (prevId absent) skips anchoring.
      scroller.scrollTop += scroller.scrollHeight - prevScrollHeight.current;
    }

    prevFirstId.current = firstId;
    prevScrollHeight.current = scroller.scrollHeight;
  }, [messages, loading]);

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

  const handleSend = async (body: string) => {
    const tempId = `temp-${Date.now()}`;
    addOptimisticMessage({
      id: tempId,
      sender_id: user!.id,
      body,
      created_at: new Date().toISOString(),
    });
    try {
      const res = await api.sendMessage({ conversationId: conversation.id, body });
      confirmOptimistic(tempId, res.message);
      // one refetch per send (not per received event): refreshes seen-at/can_send,
      // no realtime path for reads pre-R1
      void refetchInbox();
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
              email={isGroup ? undefined : conversation.other_user?.email}
              name={title}
              imageUrl={isGroup ? undefined : conversation.other_user?.image_url}
              size={headerAvatarSize}
            />
            <div className="messages-thread__header-text">
              <h2 className="messages-thread__title">{title}</h2>
              {isGroup && (
                <div className="messages-thread__subtitle">
                  {Array.from(senderNames.values()).join(', ')}
                </div>
              )}
            </div>
          </div>
          <ConversationMenu
            conversationId={conversation.id}
            onDeleted={onDeleted}
            alwaysVisible
          />
        </header>
      )}

      <div className="messages-thread__scroll" ref={scrollRef}>
        {hasMore && (
          <div ref={topSentinelRef} className="messages-thread__older">
            {loadingOlder ? 'Loading earlier messages…' : ''}
          </div>
        )}
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
          messages.map((m, i) => {
            const day = new Date(m.created_at).toDateString();
            const prevDay = i > 0 ? new Date(messages[i - 1].created_at).toDateString() : null;
            return (
              <React.Fragment key={m.id}>
                {day !== prevDay && (
                  <div className="messages-thread__day">
                    {new Date(m.created_at).toLocaleDateString([], {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </div>
                )}
                <MessageBubble
                  message={m}
                  isMine={m.sender_id === user?.id}
                  author={isGroup ? senderNames.get(m.sender_id) ?? 'Unknown' : null}
                  pending={m.id.startsWith('temp-')}
                />
              </React.Fragment>
            );
          })
        )}
        {conversation.type === 'dm' && seenAt && (
          <div className="messages-thread__seen">
            Seen{' '}
            {seenAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>

      <MessageComposer
        disabled={!conversation.can_send}
        disabledReason={isGroup
          ? "You're no longer in this team channel."
          : `You and ${title} don't currently share a class. Conversation is read-only.`}
        onSend={handleSend}
      />
    </div>
  );
};
