import type { ApiScrumMember } from '@/lib/api';

/** A person as the board renders them (resolved from the payload's members). */
export interface BoardPerson {
  user_id: string;
  name: string;
  image_url?: string | null;
}

/** Shown when a person can't be resolved, or when nobody is assigned. */
export const UNKNOWN_PERSON = 'Unknown';
export const UNASSIGNED = 'Unassigned';

/** Reporter/assignee lookup built once per board load. */
export type MemberMap = Record<string, ApiScrumMember>;

export function buildMemberMap(members: ApiScrumMember[]): MemberMap {
  return Object.fromEntries(members.map((m) => [m.user_id, m]));
}

/** Resolve an id to a renderable person; unknown ids degrade to a label. */
export function personOf(map: MemberMap, id: string | null, fallback: string = UNASSIGNED): BoardPerson {
  if (!id) return { user_id: '', name: fallback, image_url: null };
  const m = map[id];
  return m ? { user_id: m.user_id, name: m.name, image_url: m.image_url } : { user_id: id, name: UNKNOWN_PERSON, image_url: null };
}
