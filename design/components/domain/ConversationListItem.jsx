import React from 'react';
import { Avatar } from '../display/Avatar.jsx';

/**
 * Conversation list item — avatar, name, preview, time, unread count.
 */
export function ConversationListItem({
  name,
  preview,
  time,
  unread = 0,
  active = false,
  online = false,
  onClick,
  className = '',
}) {
  return (
    <button
      type="button"
      className={['gt-convo', active ? 'gt-convo--active' : '', unread > 0 ? 'gt-convo--unread' : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className="gt-convo__avatar">
        <Avatar name={name} size="md" />
        {online && <span className="gt-convo__dot" aria-label="online" />}
      </span>
      <span className="gt-convo__main">
        <span className="gt-convo__top">
          <span className="gt-convo__name">{name}</span>
          {time && <span className="gt-convo__time">{time}</span>}
        </span>
        <span className="gt-convo__bottom">
          <span className="gt-convo__preview">{preview}</span>
          {unread > 0 && <span className="gt-convo__badge">{unread}</span>}
        </span>
      </span>
    </button>
  );
}

/**
 * Message bubble — green for own messages, white for others.
 */
export function MessageBubble({ children, own = false, author, time, className = '' }) {
  return (
    <div className={['gt-bubble-row', own ? 'gt-bubble-row--own' : '', className].filter(Boolean).join(' ')}>
      <div className={['gt-bubble', own ? 'gt-bubble--own' : ''].filter(Boolean).join(' ')}>
        {!own && author && <span className="gt-bubble__author">{author}</span>}
        <span className="gt-bubble__text">{children}</span>
        {time && <span className="gt-bubble__time">{time}</span>}
      </div>
    </div>
  );
}

/**
 * Message composer — input + send button pinned to the thread footer.
 */
export function MessageComposer({ value = '', onChange, onSend, placeholder = 'Type a message…', disabled = false, className = '' }) {
  const send = () => {
    if (disabled || !value.trim()) return;
    onSend && onSend(value.trim());
  };
  return (
    <div className={['gt-composer', className].filter(Boolean).join(' ')}>
      <input
        className="gt-composer__input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        aria-label="Message"
      />
      <button type="button" className="gt-composer__send" aria-label="Send message" onClick={send} disabled={disabled || !value.trim()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/** Standalone red unread-count pill (sidebar, tabs). */
export function UnreadBadge({ count = 0, max = 99, className = '' }) {
  if (!count) return null;
  return <span className={['gt-unread', className].filter(Boolean).join(' ')}>{count > max ? `${max}+` : count}</span>;
}
