import React, { useEffect, useRef, useState } from 'react';
import { HiDotsVertical } from 'react-icons/hi';
import { api } from '@/lib/api';
import { useConversations } from '../hooks/useConversations';

interface Props {
  conversationId: string;
  /** Called after a successful delete. */
  onDeleted?: () => void;
  /** When true, the icon is always visible (used in the thread header).
   *  When false (default), the parent controls visibility via hover/focus CSS. */
  alwaysVisible?: boolean;
}

/**
 * Vertical-dots icon + dropdown with a single "Delete" action.
 * Closes on outside click or Escape. Hover/focus reveal is handled by the
 * parent's CSS when `alwaysVisible` is false.
 */
export const ConversationMenu: React.FC<Props> = ({
  conversationId,
  onDeleted,
  alwaysVisible = false,
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { refetch } = useConversations();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.deleteConversation(conversationId);
      await refetch();
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ConversationMenu] delete failed:', err);
      window.alert('Could not delete the conversation. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={ref}
      className={`conversation-menu ${alwaysVisible ? 'conversation-menu--always-visible' : ''}`}
    >
      <button
        type="button"
        className="conversation-menu__trigger"
        aria-label="Conversation actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        <HiDotsVertical size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="conversation-menu__dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="conversation-menu__item conversation-menu__item--danger"
            onClick={handleDelete}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
};
