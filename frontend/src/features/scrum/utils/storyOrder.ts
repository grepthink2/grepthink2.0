import type { ApiScrumStory } from '@/lib/api';

type Ordered = Pick<ApiScrumStory, 'key' | 'rank'>;

/** A key's place: by the number after its last "-" ("US-2" before "US-10"), else after those, as text. */
function keyOrder(key: string): [number, number, string] {
  const tail = key.slice(key.lastIndexOf('-') + 1);
  return /^\d+$/.test(tail) ? [0, Number(tail), key] : [1, 0, key];
}

/**
 * The order of one list of stories, a sprint's or the backlog's, as the board sends it (the backend's
 * `_story_order`): by rank, then the stories nobody has ordered (no rank) by key.
 */
export function compareStories(a: Ordered, b: Ordered): number {
  const ra = a.rank ?? null;
  const rb = b.rank ?? null;
  if (ra === null && rb !== null) return 1;
  if (ra !== null && rb === null) return -1;
  if (ra !== null && rb !== null && ra !== rb) return ra - rb;
  const [ga, na, ta] = keyOrder(a.key);
  const [gb, nb, tb] = keyOrder(b.key);
  if (ga !== gb) return ga - gb;
  if (na !== nb) return na - nb;
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/** `stories` in the board's order, as a new list. */
export function sortStories<T extends Ordered>(stories: T[]): T[] {
  return [...stories].sort(compareStories);
}
