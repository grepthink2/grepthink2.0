import React from 'react';
import type { ApiMessage } from '@/lib/api';

interface Props {
  message: ApiMessage;
  isMine: boolean;
  /** Sender display name — rendered above the bubble for group threads. */
  author?: string | null;
  /** True while an optimistic send awaits the server row. */
  pending?: boolean;
}

/** Single message bubble — left-aligned for theirs, right-aligned for mine. */
export const MessageBubble: React.FC<Props> = ({ message, isMine, author, pending }) => {
  return (
    <div
      className={[
        'messages-bubble',
        `messages-bubble--${isMine ? 'mine' : 'theirs'}`,
        pending ? 'messages-bubble--pending' : '',
      ].filter(Boolean).join(' ')}
    >
      {!isMine && author && <div className="messages-bubble__author">{author}</div>}
      <div className="messages-bubble__body">{message.body}</div>
      <div className="messages-bubble__time">
        {new Date(message.created_at).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
};
