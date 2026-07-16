import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LuMessageCircle, LuChevronDown, LuChevronLeft } from 'react-icons/lu';
import { emailToDisplayName } from '@features/app/utils/memberUtils';
import { useConversations } from '../hooks/useConversations';
import { useUnreadTotal } from '../hooks/useUnreadTotal';
import { ConversationList } from './ConversationList';
import { ConversationThread } from './ConversationThread';
import { ConversationMenu } from './ConversationMenu';
import { InitialsAvatar } from './InitialsAvatar';
// Shared messages styles — needed when widget is mounted outside the
// Messages page (Vite dedupes the import, so no double-injection).
import '../pages/Messages.scss';

/**
 * Floating chat tab in the bottom-right corner. Collapsed by default;
 * clicking expands to a 360×480 popover that reuses ConversationList
 * and ConversationThread.
 *
 * Auto-hides on /app/messages* (where the full-page route already lives)
 * and on screens < 768px (handled in CSS).
 *
 * Pulls inbox state from useConversations (provider mounted higher up),
 * so this component adds zero new polling.
 */
export const MessageWidget: React.FC = () => {
  const location = useLocation();
  const { conversations, loading } = useConversations();
  const unreadTotal = useUnreadTotal();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Hide on the full Messages page to avoid duplicate UI.
  if (location.pathname.startsWith('/app/messages')) return null;

  const selected = selectedId
    ? conversations.find(c => c.id === selectedId) ?? null
    : null;

  const otherName = selected
    ? (() => {
        const first = selected.other_user?.first_name?.trim() ?? '';
        const last = selected.other_user?.last_name?.trim() ?? '';
        const full = `${first} ${last}`.trim();
        return full ||
          (selected.other_user?.email ? emailToDisplayName(selected.other_user.email) : 'Unknown');
      })()
    : '';

  const renderUnreadBadge = () =>
    unreadTotal > 0 && (
      <span className="message-widget__unread" aria-label={`${unreadTotal} unread`}>
        {unreadTotal > 99 ? '99+' : unreadTotal}
      </span>
    );

  if (!isOpen) {
    return (
      <button
        type="button"
        className="message-widget message-widget--tab"
        onClick={() => setIsOpen(true)}
        aria-label="Open messages"
      >
        <LuMessageCircle size={18} aria-hidden="true" />
        <span className="message-widget__label">Messages</span>
        {renderUnreadBadge()}
      </button>
    );
  }

  return (
    <div className="message-widget message-widget--popover" role="dialog" aria-label="Messages">
      <header className="message-widget__header">
        {selected ? (
          <>
            <button
              type="button"
              className="message-widget__back"
              onClick={() => setSelectedId(null)}
              aria-label="Back to inbox"
            >
              <LuChevronLeft size={20} aria-hidden="true" />
            </button>
            <InitialsAvatar
              email={selected.other_user?.email}
              name={otherName}
              imageUrl={selected.other_user?.image_url}
              size={32}
            />
            <span className="message-widget__title">{otherName}</span>
            <ConversationMenu
              conversationId={selected.id}
              onDeleted={() => setSelectedId(null)}
              alwaysVisible
            />
          </>
        ) : (
          <>
            <span className="message-widget__title">Messages</span>
            {renderUnreadBadge()}
          </>
        )}
        <button
          type="button"
          className="message-widget__minimize"
          onClick={() => setIsOpen(false)}
          aria-label="Minimize"
        >
          <LuChevronDown size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="message-widget__body">
        {selected ? (
          <ConversationThread
            conversation={selected}
            onDeleted={() => setSelectedId(null)}
            hideHeader
          />
        ) : (
          <ConversationList
            conversations={conversations}
            loading={loading}
            activeId={null}
            avatarSize={40}
            showHeader={false}
            onSelect={(id) => setSelectedId(id)}
          />
        )}
      </div>
    </div>
  );
};
