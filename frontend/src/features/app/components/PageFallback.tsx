import React from 'react';
import { Skeleton } from '@/components/Skeleton/Skeleton';

/**
 * Fallback for the shared route-level <Suspense> boundary in AppView, shown
 * while a lazily-loaded page chunk (see the `React.lazy` routes in App.tsx)
 * is being fetched. Deliberately generic — unlike the per-page skeletons
 * from Task E1 (which mirror the exact layout they precede), this boundary
 * can sit in front of any of a dozen different pages, so it can't shape
 * itself to the destination. Mirrors AppView's own auth-loading gate
 * treatment (a centered shimmer stack) rather than inventing a new idiom.
 */
export const PageFallback: React.FC = () => (
  <div
    className="page-fallback"
    aria-busy="true"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      width: '100%',
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Skeleton width={220} height={22} />
      <Skeleton width={280} height={14} />
    </div>
  </div>
);

export default PageFallback;
