import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { RELEASES, type Release } from '../releaseNotes';
import { isReleaseNew } from '../seenStore';
import { ReleaseEntry } from './ReleaseEntry';

export interface ReleaseFeedProps {
  /** Newest first. @default every file in notes/ */
  releases?: Release[];
  /**
   * Releases newer than this carry "New"; null (a first visit) marks only the newest. The host passes
   * the value the modal opened with, so the markers stay put while it is open.
   */
  lastSeen: string | null;
  /** 'dark' inside a `Modal tone="dark"`. @default 'light' */
  tone?: 'light' | 'dark';
}

/**
 * The What's new modal's content, ported from design/components/releases/ReleaseFeed.jsx: the releases
 * newest first with their "New" markers, or the card EmptyState when there is none. This module is the
 * feed's lazy chunk (loadReleaseFeed), with the parsed notes and MarkdownText; the loading and failed
 * states belong to WhatsNewModal, which is there before the chunk is.
 */
export default function ReleaseFeed({ releases = RELEASES, lastSeen, tone = 'light' }: ReleaseFeedProps) {
  const dark = tone === 'dark' ? 'gt-release-feed--dark' : '';
  if (!releases.length) {
    return (
      <div className={['gt-release-feed', 'gt-release-feed--empty', dark].filter(Boolean).join(' ')}>
        <EmptyState
          variant="card"
          icon={<FileText size={16} aria-hidden="true" />}
          title="No release notes yet"
          description="Every version from 0.91.0 on comes with its notes. They appear here."
        />
      </div>
    );
  }
  const newest = releases[0].version;
  return (
    <div className={['gt-release-feed', dark].filter(Boolean).join(' ')}>
      {releases.map((release) => (
        <ReleaseEntry key={release.version} release={release} isNew={isReleaseNew(release.version, lastSeen, newest)} />
      ))}
    </div>
  );
}
