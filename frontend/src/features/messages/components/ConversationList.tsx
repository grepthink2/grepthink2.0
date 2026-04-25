import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ApiConversationSummary } from '@/lib/api';
import { emailToDisplayName } from '@features/app/utils/memberUtils';

interface Props {
  conversations: ApiConversationSummary[];
  loading: boolean;
}

/** Left-rail inbox. Each item shows other party, last message preview,
 *  unread count, and timestamp. Clicking selects the conversation. */
export const ConversationList: React.FC<Props> = ({ conversations, loading }) => {
  const navigate = useNavigate();
  const { conversationId: activeId } = useParams<{ conversationId: string }>();

  if (loading && conversations.length === 0) {
    return <div className="messages-list messages-list--empty">Loading…</div>;
  }
  if (conversations.length === 0) {
    return (
      <div className="messages-list messages-list--empty">
        No conversations yet. Visit a project page and click Message to start one.
      </div>
    );
  }

  return (
    <ul className="messages-list">
      {conversations.map(c => {
        const isActive = c.id === activeId;
        const name =
          c.other_user.name ||
          (c.other_user.email ? emailToDisplayName(c.other_user.email) : 'Unknown user');
        const preview = c.last_message?.body ?? '';
        const time = c.last_message_at
          ? new Date(c.last_message_at).toLocaleDateString([], {
              month: 'short', day: 'numeric',
            })
          : '';
        return (
          <li
            key={c.id}
            className={`messages-list__item ${isActive ? 'messages-list__item--active' : ''}`}
            onClick={() => navigate(`/app/messages/${c.id}`)}
          >
            <div className="messages-list__row">
              <span className="messages-list__name">{name}</span>
              <span className="messages-list__time">{time}</span>
            </div>
            <div className="messages-list__row">
              <span className="messages-list__preview">{preview}</span>
              {c.unread_count > 0 && (
                <span className="messages-list__unread">{c.unread_count}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
