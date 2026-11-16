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

/**
 * The name a person's avatar takes its initials and colour from: none for the "Unknown" placeholder
 * (an id no member matches, or the API's own fallback for a comment's author), so the avatar shows
 * "?" rather than the placeholder's initials.
 */
export function avatarName(name: string): string | undefined {
  return name === UNKNOWN_PERSON ? undefined : name;
}

/** Reporter/assignee lookup built once per board load. */
export type MemberMap = Record<string, ApiScrumMember>;

/** How a team member moves one story within its list (a sprint's, or the backlog's); staff get none. */
export interface StoryOrderControl {
  /** Move the story one place up (higher priority) or down. */
  onMove: (direction: 'up' | 'down') => void;
  /** First of its list: Move up is off. */
  first: boolean;
  /** Last of its list: Move down is off. */
  last: boolean;
  /** The list's new order is saving: the buttons keep their focus and ignore clicks. */
  busy?: boolean;
}

export function buildMemberMap(members: ApiScrumMember[]): MemberMap {
  return Object.fromEntries(members.map((m) => [m.user_id, m]));
}

/** Resolve an id to a renderable person; unknown ids degrade to a label. */
export function personOf(map: MemberMap, id: string | null, fallback: string = UNASSIGNED): BoardPerson {
  if (!id) return { user_id: '', name: fallback, image_url: null };
  const m = map[id];
  return m ? { user_id: m.user_id, name: m.name, image_url: m.image_url } : { user_id: id, name: UNKNOWN_PERSON, image_url: null };
}
