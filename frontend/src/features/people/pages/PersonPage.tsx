import { useEffect, useState } from 'react';
import { Eye, LockKeyhole } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@components/Button/Button';
import { Card } from '@components/Card/Card';
import { EmptyState } from '@components/EmptyState/EmptyState';
import { Skeleton } from '@components/Skeleton/Skeleton';
import { api, type ApiPersonProfile } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { useClass } from '@/lib/classContext';
import { openSettings } from '@/lib/openSettings';
import { usePreview } from '@/lib/previewContext';
import { ProfileHeader } from '../components/ProfileHeader';
import { ProfileStaffLinks } from '../components/ProfileStaffLinks';
import { ProfileTeams } from '../components/ProfileTeams';
import { isSparse, orderShared, staffGroups } from '../peopleModel';
import '../people.scss';

type Outcome = { kind: 'ready'; profile: ApiPersonProfile } | { kind: 'hidden' } | { kind: 'failed' };

/**
 * A person's page, `/app/people/:userId`. Read-only, and it shows only what the answer carries:
 * the header card, "Teams" and, for staff of a class shared with a student, "For staff" beside it.
 * Your own page adds "Edit profile", a nudge when nothing is filled in, and a line on who sees the
 * page.
 *
 * While the answer is on its way the page is a skeleton. A 404 is "You can't see this person": the
 * same words for nobody by that id and for somebody the viewer shares no class with, so the page
 * never confirms that an account exists. Any other failure offers "Try again".
 */
export default function PersonPage() {
  const { userId = '' } = useParams();
  const { selectedClass } = useClass();
  const { isPreviewing } = usePreview();
  const [attempt, setAttempt] = useState(0);
  // An answer belongs to the person and the attempt it was asked for. One that arrives for another
  // is never shown, so the next person's page starts as a skeleton, not as the last person.
  const asked = `${userId}#${attempt}`;
  const [answer, setAnswer] = useState<{ asked: string; outcome: Outcome } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.getPersonProfile(userId, controller.signal).then(
      (profile) => {
        if (!controller.signal.aborted) setAnswer({ asked, outcome: { kind: 'ready', profile } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const hidden = error instanceof ApiError && (error.status === 404 || error.status === 422);
        setAnswer({ asked, outcome: { kind: hidden ? 'hidden' : 'failed' } });
      },
    );
    return () => controller.abort();
  }, [userId, asked]);

  const outcome = answer?.asked === asked ? answer.outcome : null;

  if (!outcome) {
    return (
      <div className="gt-profile" aria-busy="true">
        <span className="gt-visually-hidden" role="status">
          Loading profile
        </span>
        <Card className="gt-profile__head">
          <div className="gt-profile__ghost-head">
            <Skeleton width={64} height={64} circle />
            <div className="gt-profile__ghost-lines">
              <Skeleton width={220} height={22} />
              <Skeleton width={140} height={13} />
              <Skeleton width={260} height={22} radius={7} />
            </div>
          </div>
        </Card>
        <div className="gt-profile__body">
          <div className="gt-profile__ghost-card">
            <Skeleton width={72} height={16} />
            <Skeleton height={132} radius={7} />
          </div>
        </div>
      </div>
    );
  }

  if (outcome.kind === 'hidden') {
    return (
      <div className="gt-profile">
        <EmptyState
          titleAs="h2"
          icon={<LockKeyhole size={28} />}
          title="You can’t see this person"
          description="A profile is visible to people who share a class with its owner."
          action={
            <Button variant="outline" to="/app/home">
              Go to Home
            </Button>
          }
        />
      </div>
    );
  }

  if (outcome.kind === 'failed') {
    return (
      <div className="gt-profile">
        <EmptyState
          variant="error"
          titleAs="h2"
          title="Couldn’t load this profile"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  }

  const profile = { ...outcome.profile, shared: orderShared(outcome.profile.shared, selectedClass?.id) };
  const groups = staffGroups(profile, isPreviewing);
  const hasStaff = groups.length > 0;
  return (
    <div className="gt-profile">
      <Card className="gt-profile__head">
        <ProfileHeader profile={profile} isPreviewing={isPreviewing} />
        {profile.is_self && isSparse(profile.person) && (
          <p className="gt-profile__nudge">
            Add a photo, GitHub and LinkedIn so teammates know who they are working with.{' '}
            <button type="button" className="gt-profile__nudge-link" onClick={() => openSettings('profile')}>
              Edit profile
            </button>
          </p>
        )}
      </Card>
      <div className={`gt-profile__body${hasStaff ? ' gt-profile__body--staff' : ''}`}>
        <ProfileTeams shared={profile.shared} />
        {hasStaff && (
          <aside className="gt-profile__aside" aria-label="For staff">
            <ProfileStaffLinks groups={groups} />
          </aside>
        )}
      </div>
      {profile.is_self && (
        <p className="gt-profile__visibility">
          <Eye size={14} aria-hidden="true" />
          People who share a class with you see this page. Only your TAs and instructors see your school email.
        </p>
      )}
    </div>
  );
}
