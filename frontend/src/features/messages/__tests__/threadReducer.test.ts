import { describe, expect, it } from 'vitest';
import { appendMessage, applyIncoming, prependOlder, reconcileOptimistic } from '../threadReducer';
import type { ApiMessage } from '@/lib/api';

const m = (id: string, at: string): ApiMessage =>
  ({ id, sender_id: 's', body: 'b', created_at: at });

describe('threadReducer', () => {
  it('appendMessage dedupes by id', () => {
    const prev = [m('a', '1'), m('b', '2')];
    expect(appendMessage(prev, m('b', '2'))).toBe(prev);       // no-op
    expect(appendMessage(prev, m('c', '3'))).toHaveLength(3);  // appended
  });

  it('reconcileOptimistic swaps temp for server row, deduping the echo', () => {
    const prev = [m('temp-1', '1')];
    const real = m('server-1', '1');
    const next = reconcileOptimistic(prev, 'temp-1', real);
    expect(next.map(x => x.id)).toEqual(['server-1']);
    // realtime echo of the same row later is a no-op
    expect(appendMessage(next, real)).toBe(next);
  });

  it('prependOlder puts older page first and dedupes overlap', () => {
    const cur = [m('c', '3'), m('d', '4')];
    const older = [m('a', '1'), m('b', '2'), m('c', '3')]; // overlap on c
    expect(prependOlder(cur, older).map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('applyIncoming — own-echo dedupe (group-send double render)', () => {
  const me = 'me-1';
  const pending = (body: string): ApiMessage =>
    ({ id: `temp-${body}`, sender_id: me, body, created_at: '2026-01-01T00:00:00+00:00' });
  const server = (id: string, body: string, sender = me): ApiMessage =>
    ({ id, sender_id: sender, body, created_at: '2026-01-01T00:00:01+00:00' });

  it('swaps my pending temp for the echoed server row instead of duplicating', () => {
    const prev = [pending('hello team')];
    const next = applyIncoming(prev, server('srv-1', 'hello team'), me);
    expect(next).toHaveLength(1);                 // <- was 2 before the fix
    expect(next[0].id).toBe('srv-1');
  });

  it('still appends messages from other people', () => {
    const prev = [pending('mine')];
    const next = applyIncoming(prev, server('srv-2', 'theirs', 'someone-else'), me);
    expect(next.map(m => m.id)).toEqual(['temp-mine', 'srv-2']);
  });

  it('is a no-op when the row is already present', () => {
    const prev = [server('srv-3', 'x')];
    expect(applyIncoming(prev, server('srv-3', 'x'), me)).toBe(prev);
  });

  it('confirmOptimistic after an echo-swap leaves exactly one copy', () => {
    const real = server('srv-4', 'ack me');
    const afterEcho = applyIncoming([pending('ack me')], real, me);
    const afterAck = reconcileOptimistic(afterEcho, 'temp-ack me', real);
    expect(afterAck.map(m => m.id)).toEqual(['srv-4']);
  });
});
