import { describe, expect, it } from 'vitest';
import { appendMessage, prependOlder, reconcileOptimistic } from '../threadReducer';
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
