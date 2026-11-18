import { lazy, Suspense } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import type { HomeScheduleProps } from './HomeSchedule';
import { ScheduleSkeleton } from './ScheduleSkeleton';
import './homeScheduleCard.scss';

// The week and its code (the agenda, its rows, the week arithmetic) are a chunk of their own, so Home
// stays in the entry chunk without them; the loading rows show while it loads.
const HomeSchedule = lazy(() => import('./HomeSchedule'));

/** While the week's code loads: its toolbar's room, then the loading rows on the week's surface. */
const LOADING = (
  <div className="gt-sched-home">
    <div className="gt-sched-home__toolbar" />
    <div className="gt-sched-home__days"><ScheduleSkeleton /></div>
  </div>
);

/**
 * The schedule card's body on both Homes: the week (HomeSchedule), loaded the first time Home renders.
 * Code that fails to load (a deploy since the page opened) says so in the card, not across the page;
 * another class tries again.
 */
export function HomeScheduleCard(props: HomeScheduleProps) {
  return (
    <ErrorBoundary
      resetKey={props.classId}
      fallback={<Alert tone="warning">Couldn’t load your schedule. Refresh the page to try again.</Alert>}
    >
      <Suspense fallback={LOADING}>
        <HomeSchedule {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
