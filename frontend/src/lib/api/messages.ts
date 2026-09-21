/** Messaging: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type { ApiContact, ApiConversationSummary, ApiMessage } from './types';

export const messagesApi = {

  // ----- Messages ----------------------------------------------------------

  /** Inbox: caller's conversations (DMs + team channels) by latest activity. */
  getConversations: async () => {
    return apiRequest<{ conversations: ApiConversationSummary[] }>('/api/messages/conversations');
  },

  /** Send a message. Exactly one target: an existing conversation (DM or
   *  team channel) via conversationId, or a new DM via toUserId. */
  sendMessage: async (args: { conversationId?: string; toUserId?: string; body: string }) => {
    return apiRequest<{ conversation_id: string; message: ApiMessage }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: args.conversationId,
        to_user_id: args.toUserId,
        body: args.body,
      }),
    });
  },

  /** A page of messages (newest first). Pass `before` (next_cursor from the
   *  previous page) to load older history. The cursor is OPAQUE — echo it
   *  byte-for-byte; never parse or re-serialize it (backend 400s otherwise). */
  getMessages: async (conversationId: string, opts?: { before?: string }) => {
    const params = opts?.before ? `?before=${encodeURIComponent(opts.before)}` : '';
    return apiRequest<{ messages: ApiMessage[]; next_cursor: string | null }>(
      `/api/messages/conversations/${conversationId}/messages${params}`,
    );
  },

  /** Server-side messageable-users list (replaces per-class fan-out). */
  getContacts: async (q?: string) => {
    const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    return apiRequest<{ contacts: ApiContact[] }>(`/api/messages/contacts${params}`);
  },

  /** Mark conversation as read through now(). 204 on success. */
  markConversationRead: async (conversationId: string) => {
    return apiRequest<void>(`/api/messages/conversations/${conversationId}/read`, {
      method: 'POST',
    });
  },

  /** Hide a conversation from the caller's inbox (idempotent). 204 on success.
   *  Other party's view is unaffected. Conversation reappears for caller if
   *  the other party sends a new message after this delete. */
  deleteConversation: async (conversationId: string) => {
    return apiRequest<void>(`/api/messages/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  },
};
