import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/Button/Button';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { reloadPage } from '@/lib/reloadPage';

interface StateProps {
  /** 'dark' inside a `Modal tone="dark"`. */
  tone: 'light' | 'dark';
}

const feedClass = (state: string, tone: StateProps['tone']) =>
  ['gt-release-feed', `gt-release-feed--${state}`, tone === 'dark' ? 'gt-release-feed--dark' : ''].filter(Boolean).join(' ');

/**
 * The feed's loading state, ported from design/components/releases/ReleaseFeed.jsx: two ghost entries of
 * Skeleton rows while the feed's chunk loads (usually a blink). It ships with WhatsNewModal, not the chunk.
 * The "Loading release notes" status sits outside the `aria-busy` region, which assistive tech may hold
 * back until it settles.
 */
export function ReleaseFeedLoading({ tone }: StateProps) {
  return (
    <>
      <span className="gt-visually-hidden" role="status">Loading release notes</span>
      <div className={feedClass('loading', tone)} aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="gt-release-feed__ghost">
            <div className="gt-release-feed__ghost-head">
              <Skeleton width={148} height={14} />
              <Skeleton width={46} height={11} />
            </div>
            <Skeleton width={56} height={9} />
            <Skeleton width="92%" height={11} />
            <Skeleton width="78%" height={11} />
            <Skeleton width="64%" height={11} />
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The feed's failed state: the chunk did not load, because the network dropped or because a deploy removed
 * the file this page asked for. "Reload" loads the page again; a retry would ask for the same missing file.
 */
export function ReleaseFeedFailed({ tone }: StateProps) {
  return (
    <div className={feedClass('failed', tone)} role="status">
      <EmptyState
        variant="card"
        icon={<CircleAlert size={16} aria-hidden="true" />}
        title="The release notes didn't load."
        action={<Button size="sm" onClick={reloadPage}>Reload</Button>}
      />
    </div>
  );
}
