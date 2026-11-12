import { lazy, Suspense } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import type { HomeScheduleProps } from './HomeSchedule';
import { ScheduleSkeleton } from './ScheduleSkeleton';

// The week and its code (the agenda, its rows, the week arithmetic) are a chunk of their own, so Home
// stays in the entry chunk without them; the loading rows show while it loads.
const HomeSchedule = lazy(() => import('./HomeSchedule'));

/**
 * The schedule card's body on both Homes: the week (HomeSchedule), loaded the first time Home renders.
 * Code that fails to load (a deploy since the page opened) says so in the card, not across the page.
 */
export function HomeScheduleCard(props: HomeScheduleProps) {
  return (
    <ErrorBoundary fallback={<Alert tone="warning">Couldn’t load your schedule. Refresh the page to try again.</Alert>}>
      <Suspense fallback={<ScheduleSkeleton count={3} compact={false} />}>
        <HomeSchedule {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
