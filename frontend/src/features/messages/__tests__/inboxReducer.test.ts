import { describe, expect, it } from 'vitest';
import { applyIncomingMessage, normalizeTimestamp, type IncomingMessageRow } from '../inboxReducer';
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

  it('normalizes postgres space-separated timestamps into parseable ISO', () => {
    const prev = [conv('a', null)];
    const { next } = applyIncomingMessage(
      prev, msg('a', 'them', '2026-07-12 00:00:00+00'), 'me');
    expect(next[0].last_message_at).toBe('2026-07-12T00:00:00+00:00');
    // The short "+00" offset is an Invalid Date per ECMA-262; the expanded
    // form must actually parse or every realtime-touched row blanks its time.
    expect(Number.isNaN(new Date(next[0].last_message_at!).getTime())).toBe(false);
  });

  it('expands negative short offsets and leaves full offsets/Z untouched', () => {
    expect(normalizeTimestamp('2026-07-12 17:30:00-07')).toBe('2026-07-12T17:30:00-07:00');
    expect(Number.isNaN(Date.parse(normalizeTimestamp('2026-07-12 17:30:00-07')))).toBe(false);
    // Already-normalized inputs pass through unchanged (idempotent).
    expect(normalizeTimestamp('2026-07-12T00:00:00+00:00')).toBe('2026-07-12T00:00:00+00:00');
    expect(normalizeTimestamp('2026-07-12T00:00:00Z')).toBe('2026-07-12T00:00:00Z');
  });

  it('sorts refetch-format microsecond timestamps above same-second realtime ones', () => {
    // Refetch payloads carry microseconds ("...00.500000+00:00"); realtime
    // deltas are whole seconds. Numeric time comparison must rank the .5s
    // row above the .0s row of the SAME second — string collation cannot be
    // trusted across the two formats.
    const prev = [
      conv('a', '2026-07-12T00:00:00.500000+00:00'),
      conv('b', '2026-07-01T00:00:00Z'),
    ];
    const { next } = applyIncomingMessage(
      prev, msg('b', 'them', '2026-07-12 00:00:00+00'), 'me');
    expect(next[0].id).toBe('a');
    expect(next[1].id).toBe('b');
  });
});
