import React from 'react';
import { EmptyState, Skeleton } from '../feedback/EmptyState.jsx';
import { Button } from '../primitives/Button.jsx';
import { ReleaseEntry } from './ReleaseEntry.jsx';
import { isNewSince } from './ReleasesModel.jsx';

const G = ({ children, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const AlertGlyph = () => <G><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></G>;
const NotesGlyph = () => <G><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h5" /></G>;

/**
 * The modal's content (What's new, 2026-10-23): the releases newest first with their "New" markers, and the
 * three other states — `loading` (two ghost entries of Skeleton rows, `aria-busy`), `failed` (one line and a
 * "Reload" button that reloads the page: after a deploy a retry would ask for the same missing file) and empty
 * (the kit's card EmptyState; it cannot ship, but it has a look). Entries are separated by a hairline, no rail.
 * The host passes the `lastSeen` it opened with, so the markers stay put while the modal is open. `tone="dark"`
 * inside a dark Modal: the heading, version, labels and bullets follow the dark ramp.
 */
export function ReleaseFeed({ releases = [], lastSeen = null, status = 'ready', onReload, tone = 'light', titleAs = 'h3', className = '' }) {
  const cls = (state) => ['gt-release-feed', state ? `gt-release-feed--${state}` : '', tone === 'dark' ? 'gt-release-feed--dark' : '', className].filter(Boolean).join(' ');
  const reload = onReload || (() => window.location.reload());
  if (status === 'loading') {
    return (
      <div className={cls('loading')} aria-busy="true">
        <span className="gt-visually-hidden" role="status">Loading release notes</span>
        {[0, 1].map((i) => (
          <div key={i} className="gt-release-feed__ghost">
            <div className="gt-release-feed__ghost-head"><Skeleton width={148} height={14} /><Skeleton width={46} height={11} /></div>
            <Skeleton width={56} height={9} />
            <Skeleton width="92%" height={11} />
            <Skeleton width="78%" height={11} />
            <Skeleton width="64%" height={11} />
          </div>
        ))}
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className={cls('failed')} role="status">
        <EmptyState variant="card" titleAs={titleAs} icon={<AlertGlyph />} title="The release notes didn’t load."
          action={<Button size="sm" onClick={reload}>Reload</Button>} />
      </div>
    );
  }
  if (!releases.length) {
    return (
      <div className={cls('empty')}>
        <EmptyState variant="card" titleAs={titleAs} icon={<NotesGlyph />} title="No release notes yet" description="Every version from 0.91.0 on comes with its notes. They appear here." />
      </div>
    );
  }
  return (
    <div className={cls('')}>
      {releases.map((r, i) => <ReleaseEntry key={r.version} release={r} isNew={isNewSince(r, lastSeen, i)} titleAs={titleAs} />)}
    </div>
  );
}
