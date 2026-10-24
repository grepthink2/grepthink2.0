import { Badge } from '@/components/Badge/Badge';
import MarkdownText from '@/components/Markdown/MarkdownText';
import type { Release, ReleaseSectionKind } from '../releaseNotes';
import { formatReleaseDate } from '../releaseDate';

/** The groups in the order they always read. The entry draws the labels; the notes' `##` lines are markers only. */
const RELEASE_GROUPS: readonly { kind: ReleaseSectionKind; label: string }[] = [
  { kind: 'new', label: 'New' },
  { kind: 'improved', label: 'Improved' },
  { kind: 'fixed', label: 'Fixed' },
];

const NEXT_LEVEL = { h2: 'h3', h3: 'h4', h4: 'h5', h5: 'h6' } as const;

export interface ReleaseEntryProps {
  release: Release;
  /** Newer than the release this browser last saw: the "New" marker beside the date. @default false */
  isNew?: boolean;
  /** The date heading's element; the group labels are one level down. @default 'h3' */
  titleAs?: keyof typeof NEXT_LEVEL;
  className?: string;
}

/**
 * One release, ported from design/components/releases/ReleaseEntry.jsx: its date written out as the
 * heading, its version beside it, the "New" marker when it applies, then its groups in the order New,
 * Improved, Fixed, each a caps label above its list (MarkdownText). A missing group leaves no gap; the
 * feed draws the hairline between entries.
 */
export function ReleaseEntry({ release, isNew = false, titleAs: Title = 'h3', className = '' }: ReleaseEntryProps) {
  const Label = NEXT_LEVEL[Title];
  return (
    <article className={['gt-release', isNew ? 'gt-release--new' : '', className].filter(Boolean).join(' ')}>
      <header className="gt-release__head">
        <Title className="gt-release__date">
          <time dateTime={release.date}>{formatReleaseDate(release.date)}</time>
        </Title>
        <span className="gt-release__version">{release.version}</span>
        {isNew && <Badge status="release.new" size="sm" className="gt-release__marker" />}
      </header>
      {RELEASE_GROUPS.map(({ kind, label }) => {
        const section = release.sections.find((s) => s.kind === kind);
        if (!section) return null;
        return (
          <section key={kind} className={`gt-release__group gt-release__group--${kind}`}>
            <Label className="gt-release__label">{label}</Label>
            <MarkdownText className="gt-release__list" variant="compact">{section.markdown}</MarkdownText>
          </section>
        );
      })}
    </article>
  );
}
