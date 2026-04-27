import React, { useRef, useState } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
import type { ApiConversationSummary } from '@/lib/api';
import { emailToDisplayName } from '@features/app/utils/memberUtils';
import { formatRelativeTime } from '../utils/relativeTime';
import { InitialsAvatar } from './InitialsAvatar';
import { ConversationMenu } from './ConversationMenu';

interface Props {
  conversations: ApiConversationSummary[];
  loading: boolean;
  /** Currently-selected conversation id (for highlight). Optional so the
   *  widget can pass its own selection without reading the URL. */
  activeId?: string | null;
  /** Click handler for a row. Defaults to undefined so the parent decides
   *  navigation vs. inline selection. */
  onSelect?: (conversationId: string) => void;
  /** Avatar diameter in this surface. Default 51 (page); widget passes 40. */
  avatarSize?: number;
  /** Whether to render the "All Messages" + search header. Default true. */
  showHeader?: boolean;
}

/** Inbox list with header bar, avatar, name+preview, time, unread badge,
 *  and per-row three-dot menu. Used both on the Messages page and inside
 *  the floating widget. */
export const ConversationList: React.FC<Props> = ({
  conversations,
  loading,
  activeId,
  onSelect,
  avatarSize = 51,
  showHeader = true,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filtered = searchQuery
    ? conversations.filter(c => {
        const name =
          c.other_user.name ||
          (c.other_user.email ? emailToDisplayName(c.other_user.email) : '');
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : conversations;

  const renderHeader = () =>
    showHeader && (
      <div className="messages-list__header">
        {searchOpen ? (
          <input
            ref={searchInputRef}
            className="messages-list__search-input"
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setSearchQuery('');
                setSearchOpen(false);
              }
            }}
            autoFocus
          />
        ) : (
          <span className="messages-list__title">All Messages</span>
        )}
        <button
          type="button"
          className="messages-list__search"
          aria-label={searchOpen ? 'Close search' : 'Search conversations'}
          onClick={() => {
            if (searchOpen) {
              setSearchQuery('');
              setSearchOpen(false);
            } else {
              setSearchOpen(true);
            }
          }}
        >
          {searchOpen ? (
            <LuX size={18} aria-hidden="true" />
          ) : (
            <LuSearch size={18} aria-hidden="true" />
          )}
        </button>
      </div>
    );

  if (loading && conversations.length === 0) {
    return (
      <div className="messages-list">
        {renderHeader()}
        <div className="messages-list__empty">Loading…</div>
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="messages-list">
        {renderHeader()}
        <div className="messages-list__empty">
          No conversations yet. Visit a project page and click Message to start one.
        </div>
      </div>
    );
  }

  return (
    <div className="messages-list">
      {renderHeader()}
      {filtered.length === 0 && searchQuery ? (
        <div className="messages-list__empty">No results for "{searchQuery}"</div>
      ) : (
      <ul className="messages-list__items">
        {filtered.map(c => {
          const isActive = c.id === activeId;
          const name =
            c.other_user.name ||
            (c.other_user.email ? emailToDisplayName(c.other_user.email) : 'Unknown user');
          const preview = c.last_message?.body ?? '';
          const time = formatRelativeTime(c.last_message_at);
          const unread = c.unread_count;
          const unreadLabel = unread > 99 ? '99+' : String(unread);
          return (
            <li
              key={c.id}
              className={`messages-list__item ${isActive ? 'messages-list__item--active' : ''}`}
              onClick={() => onSelect?.(c.id)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(c.id);
                }
              }}
            >
              <InitialsAvatar
                email={c.other_user.email}
                name={c.other_user.name}
                size={avatarSize}
              />
              <div className="messages-list__body">
                <div className="messages-list__row">
                  <span className="messages-list__name">{name}</span>
                  <span className="messages-list__time">{time}</span>
                </div>
                <div className="messages-list__row">
                  <span className="messages-list__preview">{preview}</span>
                  {unread > 0 && (
                    <span className="messages-list__unread" aria-label={`${unread} unread`}>
                      {unreadLabel}
                    </span>
                  )}
                </div>
              </div>
              <ConversationMenu conversationId={c.id} />
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
};
