/**
 * What's new — the model (2026-10-23): versions, the "New" rule, the date, and the notes-file parser the galleries
 * feed the brief's sample Markdown through. The codebase's `features/releases/{version,releaseNotes,releaseDate}.ts`.
 */

/** The groups in the order they always read; the entry draws the label — the notes' `##` lines are markers only. */
export const RELEASE_GROUPS = [
  { kind: 'new', label: 'New' },
  { kind: 'improved', label: 'Improved' },
  { kind: 'fixed', label: 'Fixed' },
];
const GROUP_INDEX = Object.fromEntries(RELEASE_GROUPS.map((g, i) => [g.kind, i]));
export function groupLabel(kind) { const g = RELEASE_GROUPS[GROUP_INDEX[kind]]; return g ? g.label : kind; }

/** "0.91.0" → [0, 91, 0]; null for anything else (a suffix, a leading zero, letters). */
export function parseVersion(v) {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(v == null ? '' : v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
/** Part by part, numerically (0.9.0 < 0.10.0 < 0.91.0 < 1.0.0); an invalid version sorts below every valid one. */
export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}
/** Newest first. */
export function sortReleases(releases) { return [...releases].sort((a, b) => compareVersions(b.version, a.version)); }

/** The "New" marker: an entry newer than the version this browser last saw; on a first visit (`lastSeen` null or unreadable) only the newest entry. */
export function isNewSince(release, lastSeen, index) {
  if (lastSeen == null || !parseVersion(lastSeen)) return index === 0;
  return compareVersions(release.version, lastSeen) > 0;
}
/** The dot: unseen until this browser opens the modal on the current version. A higher stored version (a rollback) counts as seen. */
export function isUnseen(currentVersion, lastSeen) {
  if (!parseVersion(currentVersion)) return false;
  if (lastSeen == null || !parseVersion(lastSeen)) return true;
  return compareVersions(lastSeen, currentVersion) < 0;
}

/** "2026-10-23" → "October 23, 2026" in every time zone: a calendar date, built from its parts and formatted in UTC. */
export function formatReleaseDate(date, locale = 'en-US') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) return String(date || '');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString(locale, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * One notes file → a Release. The front matter holds `date`; `## New` / `## Improved` / `## Fixed` are markers, and
 * each section's bullet list stays Markdown for MarkdownText. Sections come out in the canonical order whatever
 * the file's. (The repo's test rejects anything else; this parser only reads.)
 */
export function parseReleaseNotes(version, markdown) {
  const text = String(markdown || '').replace(/\r\n?/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const dateLine = fm ? /^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(fm[1]) : null;
  const body = fm ? text.slice(fm[0].length) : text;
  const heads = [];
  const re = /^##\s+(New|Improved|Fixed)\s*$/gim;
  let m;
  while ((m = re.exec(body))) heads.push({ kind: m[1].toLowerCase(), start: m.index, end: m.index + m[0].length });
  const sections = [];
  heads.forEach((h, i) => {
    const chunk = body.slice(h.end, i + 1 < heads.length ? heads[i + 1].start : undefined).trim();
    if (chunk) sections.push({ kind: h.kind, markdown: chunk });
  });
  sections.sort((a, b) => GROUP_INDEX[a.kind] - GROUP_INDEX[b.kind]);
  return { version, date: dateLine ? dateLine[1] : '', sections };
}
/** { '0.91.0': '---\ndate: …' , … } → releases, newest first. */
export function releasesFromNotes(notes) { return sortReleases(Object.keys(notes).map((v) => parseReleaseNotes(v, notes[v]))); }

/** The file's helpers under one name, for the bundle (design-only, like ScheduleModel). */
export const ReleasesModel = { RELEASE_GROUPS, groupLabel, parseVersion, compareVersions, sortReleases, isNewSince, isUnseen, formatReleaseDate, parseReleaseNotes, releasesFromNotes };
