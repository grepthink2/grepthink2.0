// Intentional addition: ReleasesModel, RELEASE_GROUPS — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).

export type ReleaseGroupKind = 'new' | 'improved' | 'fixed';

export interface ReleaseSection {
  kind: ReleaseGroupKind;
  /** A bullet list with inline Markdown only (bold, italics, `code`, links) — MarkdownText renders it. */
  markdown: string;
}

/** One release = one notes file (`frontend/src/features/releases/notes/<version>.md`). */
export interface Release {
  /** "0.91.0" */
  version: string;
  /** "2026-10-23": a calendar date, shown as "October 23, 2026" in every time zone. */
  date: string;
  /** In the order new, improved, fixed; a missing group is simply absent. */
  sections: ReleaseSection[];
}

/** The groups in the order they always read, with the label the entry draws. */
export const RELEASE_GROUPS: { kind: ReleaseGroupKind; label: string }[];

export function groupLabel(kind: ReleaseGroupKind | string): string;
/** "0.91.0" → [0, 91, 0]; null for anything else. */
export function parseVersion(v: unknown): [number, number, number] | null;
/** Numeric, part by part; an invalid version sorts below every valid one. */
export function compareVersions(a: string, b: string): -1 | 0 | 1;
/** Newest first. */
export function sortReleases(releases: Release[]): Release[];
/** The "New" marker: newer than `lastSeen`; on a first visit (null) only the newest entry (index 0). */
export function isNewSince(release: Release, lastSeen: string | null, index: number): boolean;
/** The dot: unseen until this browser opened the modal on `currentVersion`; a higher stored version counts as seen. */
export function isUnseen(currentVersion: string, lastSeen: string | null): boolean;
/** "2026-10-23" → "October 23, 2026" (UTC parts; the same in every zone). */
export function formatReleaseDate(date: string, locale?: string): string;
/** One notes file (front matter + `## New` / `## Improved` / `## Fixed` bullet lists) → a Release. */
export function parseReleaseNotes(version: string, markdown: string): Release;
/** A map of version → file text → releases, newest first. */
export function releasesFromNotes(notes: Record<string, string>): Release[];

/** The helpers under one name for the design bundle (design-only, like ScheduleModel). */
export const ReleasesModel: {
  RELEASE_GROUPS: typeof RELEASE_GROUPS;
  groupLabel: typeof groupLabel;
  parseVersion: typeof parseVersion;
  compareVersions: typeof compareVersions;
  sortReleases: typeof sortReleases;
  isNewSince: typeof isNewSince;
  isUnseen: typeof isUnseen;
  formatReleaseDate: typeof formatReleaseDate;
  parseReleaseNotes: typeof parseReleaseNotes;
  releasesFromNotes: typeof releasesFromNotes;
};
