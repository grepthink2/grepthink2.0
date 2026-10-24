/**
 * A class's "Tasks - External" link: the class's task board elsewhere, which its sidebar opens in a
 * new tab. The rule is the API's (backend/app/classes/models.py): a full http(s) address with a
 * host, no spaces, at most 2048 characters. It becomes a link's href, so a javascript: or data: URL
 * never passes. A link this accepts, the API accepts too (both test suites read one table of cases).
 */

/** The longest link a class keeps (the API's MAX_EXTERNAL_TASKS_URL_LENGTH). */
export const MAX_EXTERNAL_TASKS_URL_LENGTH = 2048;

/** What to say when the API refuses a link this rule let through (a 422 naming the link). */
export const LINK_REFUSED_BY_API = "That link can't be used. Enter a full link that starts with https:// or http://.";

/** The link to save (null for a blank box), or why it cannot be saved. */
export type ParsedExternalTasksUrl = { url: string | null } | { error: string };

const SHAPE_ERROR = 'Enter a full link that starts with https:// or http://.';

/**
 * Control and format characters, surrogates, private use, and every kind of space: the API's
 * refused categories. A code point unknown to the API's Unicode tables passes there, so an
 * unassigned one passes here too.
 */
const REFUSED_CHARACTER = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Z}]/u;

function hasHost(url: string): boolean {
  try {
    return new URL(url).hostname !== '';
  } catch {
    return false; // not a URL at all, or a port past 65535
  }
}

/**
 * The API's URL parser (Python's urlsplit) refuses some sites a browser forgives, all in the part
 * between "//" and the path: square brackets anywhere but around an IPv6 host, and a character that
 * NFKC turns into "/", "?", "#", "@" or ":" (like a full-width "／"). A browser would quietly
 * percent-encode both. These are its checks.
 */
function failsApiSiteChecks(url: string): boolean {
  const rest = url.slice(url.indexOf('//') + 2);
  const end = rest.search(/[/?#]/);
  const netloc = end === -1 ? rest : rest.slice(0, end);
  const at = netloc.lastIndexOf('@');
  const user = netloc.slice(0, at + 1);
  const hostAndPort = netloc.slice(at + 1);
  if (/[[\]]/.test(user) || (/[[\]]/.test(hostAndPort) && !hostAndPort.startsWith('['))) return true;
  if ([...netloc].every((ch) => ch.charCodeAt(0) < 0x80)) return false; // ASCII: nothing to normalize
  const bare = netloc.replace(/[@:#?]/g, '');
  const normalized = bare.normalize('NFKC');
  return normalized !== bare && /[/?#@:]/.test(normalized);
}

/** Read the box: blank is no link; otherwise a usable link as typed, less surrounding spaces. */
export function parseExternalTasksUrl(raw: string): ParsedExternalTasksUrl {
  const url = raw.trim();
  if (!url) return { url: null };
  if (url.length > MAX_EXTERNAL_TASKS_URL_LENGTH) {
    return { error: `That link is too long: ${MAX_EXTERNAL_TASKS_URL_LENGTH.toLocaleString('en-US')} characters at most.` };
  }
  if (REFUSED_CHARACTER.test(url)) return { error: "A link can't contain spaces." };
  // The host must follow the "//" (the browser would forgive "https:///site"; the API does not).
  if (!/^https?:\/\/[^/?#]/i.test(url) || !hasHost(url)) return { error: SHAPE_ERROR };
  if (failsApiSiteChecks(url)) return { error: "The site part of this link has a character that can't be used. Retype it." };
  return { url };
}

/** The stored link to open, or null when there is none or it is not a usable http(s) link. */
export function externalTasksHref(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parsed = parseExternalTasksUrl(stored);
  return 'url' in parsed ? parsed.url : null;
}

/** Whether a failed request was the API refusing the link: a 422 whose detail names it. */
export function isExternalTasksUrlRefusal(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { status, detail } = err as { status?: unknown; detail?: unknown };
  return (
    status === 422 &&
    Array.isArray(detail) &&
    detail.some((issue) => Array.isArray(issue?.loc) && issue.loc.includes('external_tasks_url'))
  );
}
