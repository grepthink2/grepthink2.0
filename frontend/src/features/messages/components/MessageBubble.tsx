import React from 'react';
import type { ApiMessage } from '@/lib/api';

interface Props {
  message: ApiMessage;
  isMine: boolean;
}

/** Single message bubble — left-aligned for theirs, right-aligned for mine. */
export const MessageBubble: React.FC<Props> = ({ message, isMine }) => {
  return (
    <div className={`messages-bubble messages-bubble--${isMine ? 'mine' : 'theirs'}`}>
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
