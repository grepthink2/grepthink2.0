import React from 'react';
import { Badge } from '../display/Badge.jsx';
import { MarkdownText } from '../display/Markdown.jsx';
import { RELEASE_GROUPS, formatReleaseDate } from './ReleasesModel.jsx';

/**
 * One release (What's new, 2026-10-23): its date written out as the heading, its version beside it, the "New"
 * marker when it applies (`Badge status="release.new" size="sm"`), then its groups in the order New · Improved ·
 * Fixed, each a caps label above its bullet list (the kit's MarkdownText). A missing group leaves no gap. No rail,
 * no dots, no connecting line — the feed draws a hairline between entries. Heading levels follow the host:
 * `titleAs` (h3 under the modal's h2) and the group labels one level down.
 */
export function ReleaseEntry({ release, isNew = false, titleAs = 'h3', className = '' }) {
  const T = titleAs;
  const level = Number(String(titleAs).replace(/\D/g, ''));
  const G = level >= 1 && level < 6 ? `h${level + 1}` : 'p';
  const byKind = Object.fromEntries((release.sections || []).map((s) => [s.kind, s]));
  return (
    <article className={['gt-release', isNew ? 'gt-release--new' : '', className].filter(Boolean).join(' ')}>
      <header className="gt-release__head">
        <T className="gt-release__date"><time dateTime={release.date}>{formatReleaseDate(release.date)}</time></T>
        <span className="gt-release__version">{release.version}</span>
        {isNew && <Badge status="release.new" size="sm" className="gt-release__marker" />}
      </header>
      {RELEASE_GROUPS.map(({ kind, label }) => byKind[kind] && (
        <section key={kind} className={`gt-release__group gt-release__group--${kind}`}>
          <G className="gt-release__label">{label}</G>
          <MarkdownText className="gt-release__list">{byKind[kind].markdown}</MarkdownText>
        </section>
      ))}
    </article>
  );
}
