import { describe, expect, it } from 'vitest';
import { applyIncomingMessage, type IncomingMessageRow } from '../inboxReducer';
import type { ApiConversationSummary } from '@/lib/api';

const conv = (id: string, at: string | null): ApiConversationSummary => ({
  id, type: 'dm', project_id: null, team_name: null, participants: [],
  other_user: { id: 'x', email: null, name: null }, last_message: null,
  unread_count: 0, other_user_last_read_at: null, can_send: true,
  last_message_at: at,
});

const msg = (cid: string, sender: string, at: string): IncomingMessageRow => ({
  id: `m-${at}`, conversation_id: cid, sender_id: sender, body: 'hi', created_at: at,
});

describe('applyIncomingMessage', () => {
  it('patches preview, bumps unread for messages from others, resorts', () => {
    const prev = [conv('a', '2026-07-10T00:00:00Z'), conv('b', '2026-07-11T00:00:00Z')];
    const { next, unknownConversation } = applyIncomingMessage(
      prev, msg('a', 'them', '2026-07-12T00:00:00Z'), 'me');
    expect(unknownConversation).toBe(false);
    expect(next[0].id).toBe('a');                       // resorted to top
    expect(next[0].unread_count).toBe(1);
    expect(next[0].last_message?.body).toBe('hi');
    expect(next[0].last_message_at).toBe('2026-07-12T00:00:00Z');
  });

  it('does not bump unread for own messages', () => {
    const prev = [conv('a', null)];
    const { next } = applyIncomingMessage(prev, msg('a', 'me', '2026-07-12T00:00:00Z'), 'me');
    expect(next[0].unread_count).toBe(0);
  });

  it('flags unknown conversations for a refetch', () => {
    const { next, unknownConversation } = applyIncomingMessage(
      [conv('a', null)], msg('zzz', 'them', '2026-07-12T00:00:00Z'), 'me');
    expect(unknownConversation).toBe(true);
    expect(next.length).toBe(1);
  });

  it('normalizes postgres space-separated timestamps', () => {
    const prev = [conv('a', null)];
    const { next } = applyIncomingMessage(
      prev, msg('a', 'them', '2026-07-12 00:00:00+00'), 'me');
    expect(next[0].last_message_at).toBe('2026-07-12T00:00:00+00');
  });
});
