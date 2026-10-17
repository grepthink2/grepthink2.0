/**
 * A class's "Tasks - External" link: the class's task board elsewhere, which its sidebar opens in a
 * new tab. The rule is the API's (backend/app/classes/models.py): a full http(s) address with a
 * host, no spaces, at most 2048 characters. It becomes a link's href, so a javascript: or data: URL
 * never passes. A link this accepts, the API accepts too.
 */

/** The longest link a class keeps (the API's MAX_EXTERNAL_TASKS_URL_LENGTH). */
export const MAX_EXTERNAL_TASKS_URL_LENGTH = 2048;

/** The link to save (null for a blank box), or why it cannot be saved. */
export type ParsedExternalTasksUrl = { url: string | null } | { error: string };

const SHAPE_ERROR = 'Enter a full link that starts with https:// or http://.';

function hasHost(url: string): boolean {
  try {
    return new URL(url).hostname !== '';
  } catch {
    return false; // not a URL at all, or a port past 65535
  }
}

/** Read the box: blank is no link; otherwise a usable link as typed, less surrounding spaces. */
export function parseExternalTasksUrl(raw: string): ParsedExternalTasksUrl {
  const url = raw.trim();
  if (!url) return { url: null };
  if (url.length > MAX_EXTERNAL_TASKS_URL_LENGTH) {
    return { error: `That link is too long: ${MAX_EXTERNAL_TASKS_URL_LENGTH.toLocaleString('en-US')} characters at most.` };
  }
  // Spaces, and the invisible characters the API refuses with them.
  if (/[\s\p{C}\p{Z}]/u.test(url)) return { error: "A link can't contain spaces." };
  // The host must follow the "//" (the browser would forgive "https:///site"; the API does not).
  if (!/^https?:\/\/[^/?#]/i.test(url) || !hasHost(url)) return { error: SHAPE_ERROR };
  return { url };
}

/** The stored link to open, or null when there is none or it is not a usable http(s) link. */
export function externalTasksHref(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parsed = parseExternalTasksUrl(stored);
  return 'url' in parsed ? parsed.url : null;
}
