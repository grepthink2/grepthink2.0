import { compareVersions, parseVersion } from './version';

/**
 * Release notes: one Markdown file per release in notes/, named by its version (0.91.0.md).
 *
 *   ---
 *   date: 2026-10-23
 *   ---
 *
 *   ## New
 *
 *   - **Lead-in.** One line per change.
 *
 * The front matter holds only `date`, the day the release reached main. The sections are New, Improved and
 * Fixed, each optional and at most once, in that order, and each is a "- " list with only inline Markdown.
 * The parser refuses anything else and names the file and the line.
 */

export type ReleaseSectionKind = 'new' | 'improved' | 'fixed';

export interface ReleaseSection {
  kind: ReleaseSectionKind;
  /** The section's list as written, from its first item to its last non-blank line. */
  markdown: string;
}

export interface Release {
  version: string;
  /** YYYY-MM-DD, on the campus calendar. */
  date: string;
  /** In the order New, Improved, Fixed. */
  sections: ReleaseSection[];
}

/** A notes file that breaks the format: "<file>:<line>: <reason>", the line counted from 1. */
export class ReleaseNotesError extends Error {
  constructor(fileName: string, line: number, reason: string) {
    super(`${fileName}:${line}: ${reason}`);
    this.name = 'ReleaseNotesError';
  }
}

const MARKERS = new Map<string, ReleaseSectionKind>([
  ['## New', 'new'],
  ['## Improved', 'improved'],
  ['## Fixed', 'fixed'],
]);
const SECTION_ORDER: readonly ReleaseSectionKind[] = ['new', 'improved', 'fixed'];

/** A front matter line: a key, a colon and a space, then the value. */
const FRONT_MATTER_ENTRY = /^([A-Za-z][\w-]*): (.*)$/;
const HTML_TAG = /<[a-zA-Z/!]/;

/** What would start a block of its own inside an item, checked after up to three spaces of indent. */
const BLOCK_STARTS: readonly (readonly [RegExp, string])[] = [
  [/^#{1,6}(\s|$)/, 'no headings inside an item'],
  [/^>/, 'no block quotes inside an item'],
  // A row that starts with "|", or a delimiter row such as "--- | ---" (a table needs one).
  [/^\||^:?-+:?\s*\|/, 'no tables inside an item'],
  [/^(```|~~~)/, 'no code blocks inside an item'],
  // A thematic break ("---", "* * *"), or the "===" or "---" line under a setext heading.
  [/^(?:[-*_=](?:\s*[-*_=]){2,}|=+|-+)\s*$/, 'no horizontal rules or underlined headings inside an item'],
];

/**
 * Why an item's text, or a continuation line, would start a block inside the item, or null. `content` is the line
 * without its first two characters ("- " or the continuation's two spaces), so it starts at column 2: four or more
 * columns of indent after that make an indented code block, and a tab moves to the next multiple of four.
 */
function blockMarkdownIn(content: string): string | null {
  let column = 0;
  let index = 0;
  while (content[index] === ' ' || content[index] === '\t') {
    column += content[index] === '\t' ? 4 - ((column + 2) % 4) : 1;
    index++;
  }
  if (column >= 4) return 'no indented code blocks inside an item';
  const rest = content.slice(index);
  const block = BLOCK_STARTS.find(([pattern]) => pattern.test(rest));
  return block ? block[1] : null;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

interface OpenSection {
  kind: ReleaseSectionKind;
  marker: string;
  line: number;
  lines: string[];
}

/** Parses one notes file. `fileName` is its base name (0.91.0.md); the first problem found throws. */
export function parseRelease(fileName: string, text: string): Release {
  const version = fileName.endsWith('.md') ? fileName.slice(0, -'.md'.length) : '';
  if (!parseVersion(version)) throw new ReleaseNotesError(fileName, 1, 'file name must be MAJOR.MINOR.PATCH.md');

  // A trailing newline leaves an empty last line, which counts as a blank line.
  const lines = text.replaceAll('\r\n', '\n').split('\n');

  if (lines[0] !== '---') throw new ReleaseNotesError(fileName, 1, 'the file must start with "---"');
  const closing = lines.indexOf('---', 1);
  if (closing === -1) throw new ReleaseNotesError(fileName, 1, 'front matter is not closed');

  let date: string | null = null;
  for (let index = 1; index < closing; index++) {
    const lineNumber = index + 1;
    const entry = FRONT_MATTER_ENTRY.exec(lines[index]);
    if (!entry) throw new ReleaseNotesError(fileName, lineNumber, 'front matter lines must be "key: value"');
    const [, key, value] = entry;
    if (key !== 'date') throw new ReleaseNotesError(fileName, lineNumber, `unknown key "${key}"`);
    if (date !== null) throw new ReleaseNotesError(fileName, lineNumber, '"date" given twice');
    if (!isCalendarDate(value)) throw new ReleaseNotesError(fileName, lineNumber, `"${value}" is not a calendar date`);
    date = value;
  }
  if (date === null) throw new ReleaseNotesError(fileName, 1, 'missing "date"');

  const sections: ReleaseSection[] = [];
  const finish = (section: OpenSection) => {
    let end = section.lines.length;
    while (end > 0 && section.lines[end - 1].trim() === '') end--;
    if (end === 0) throw new ReleaseNotesError(fileName, section.line, `"${section.marker}" has no items`);
    sections.push({ kind: section.kind, markdown: section.lines.slice(0, end).join('\n') });
  };

  let open: OpenSection | null = null;
  let lastOrder = -1;
  for (let index = closing + 1; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;

    const kind = MARKERS.get(line);
    if (kind) {
      if (open) finish(open);
      const order = SECTION_ORDER.indexOf(kind);
      if (order <= lastOrder) {
        throw new ReleaseNotesError(fileName, lineNumber, 'sections must be New, Improved, Fixed, each at most once');
      }
      lastOrder = order;
      open = { kind, marker: line, line: lineNumber, lines: [] };
      continue;
    }
    if (line.startsWith('#')) throw new ReleaseNotesError(fileName, lineNumber, `unexpected heading "${line}"`);
    if (line.trim() === '') {
      // Blank lines before a section's first item are dropped; later ones stay part of its list.
      if (open && open.lines.length > 0) open.lines.push(line);
      continue;
    }
    if (!open) throw new ReleaseNotesError(fileName, lineNumber, 'only sections after the front matter');

    const isItem = line.startsWith('- ');
    // A continuation line belongs to the item above it.
    const isContinuation = line.startsWith('  ') && open.lines.length > 0;
    if (!isItem && !isContinuation) {
      throw new ReleaseNotesError(fileName, lineNumber, 'only "- " list items in a section');
    }
    if (isItem && !/^- \S/.test(line)) {
      throw new ReleaseNotesError(fileName, lineNumber, 'an item needs its text right after "- "');
    }
    const block = blockMarkdownIn(line.slice(2));
    if (block) throw new ReleaseNotesError(fileName, lineNumber, block);
    if (line.includes('![')) throw new ReleaseNotesError(fileName, lineNumber, 'no images');
    if (HTML_TAG.test(line)) throw new ReleaseNotesError(fileName, lineNumber, 'no HTML');
    open.lines.push(line);
  }
  if (open) finish(open);
  if (sections.length === 0) throw new ReleaseNotesError(fileName, 1, 'no sections');

  return { version, date, sections };
}

/**
 * Parses every file and returns the releases newest first. `files` maps a path (./notes/0.91.0.md) to its text.
 * Throws when two files hold one version, or when a higher version has an earlier date than a lower one.
 */
export function collectReleases(files: Record<string, string>): Release[] {
  const parsed: { fileName: string; release: Release }[] = [];
  const pathByVersion = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    const release = parseRelease(fileName, text);
    const other = pathByVersion.get(release.version);
    if (other !== undefined) {
      throw new ReleaseNotesError(path, 1, `version ${release.version} is also in ${other}`);
    }
    pathByVersion.set(release.version, path);
    parsed.push({ fileName, release });
  }

  parsed.sort((a, b) => compareVersions(b.release.version, a.release.version));
  for (let index = 1; index < parsed.length; index++) {
    const newer = parsed[index - 1];
    const older = parsed[index];
    if (newer.release.date < older.release.date) {
      throw new ReleaseNotesError(
        newer.fileName,
        1,
        `date ${newer.release.date} is earlier than ${older.fileName}'s ${older.release.date}; ` +
          'a higher version needs the same date or a later one',
      );
    }
  }
  return parsed.map((entry) => entry.release);
}

/** Every release in notes/, newest first. Importing this module parses them all, so a broken file throws. */
export const RELEASES: Release[] = collectReleases(
  import.meta.glob('./notes/*.md', { eager: true, query: '?raw', import: 'default' }),
);
