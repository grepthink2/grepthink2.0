import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { api } from '@/lib/api';
import { useClass, useSelectedClassRole } from '@/lib/classContext';
import { getClassDisplayStatus } from '@/lib/classLifecycle';
import { lazyModal } from '@/lib/lazyModal';
import { usePreview } from '@/lib/previewContext';
import { isMoveInInviteSettled, settleMoveInInvite } from '../moveInInviteStore';

// The student Home ships in the entry chunk, so the modal and its copy load the first time it opens.
const MoveInModal = lazyModal(() => import('./MoveInModal'), (p) => p.open);

/** A team whose board holds fewer stories than this, imported ones included, is invited to move it in. */
const MOVE_IN_INVITE_BELOW = 3;

/**
 * Opens the move-in invitation on the student Home, once a visit (see moveInInviteStore), while
 * the team's board holds fewer than MOVE_IN_INVITE_BELOW stories and an assistant can reach the
 * connector. Students only: TAs share this Home, and an instructor previewing the class has no
 * team. Never in a finished class. `held` keeps it closed while another dialog of the Home's is up.
 * The invitation is optional, so a failed read or a modal that cannot load shows nothing.
 */
export default function MoveInInvite({
  projectId,
  teamName,
  held,
}: {
  projectId: string | null;
  teamName?: string;
  held: boolean;
}) {
  const classRole = useSelectedClassRole();
  const { selectedClass } = useClass();
  const { isPreviewing } = usePreview();
  const [invitedProject, setInvitedProject] = useState<string | null>(null);

  useEffect(() => {
    if (classRole !== 'student' || isPreviewing || !projectId || !selectedClass) return;
    if (isMoveInInviteSettled(projectId) || getClassDisplayStatus(selectedClass) === 'complete') return;

    let cancelled = false;
    api
      .getScrumSummary(projectId)
      .then(({ story_count: stories, connector_ready: ready }) => {
        // A backend older than this client sends no count, and then nothing opens.
        if (cancelled || stories === undefined) return;
        if (stories >= MOVE_IN_INVITE_BELOW) settleMoveInInvite(projectId);
        else if (ready) setInvitedProject(projectId);
      })
      .catch(() => {
        // nothing to show; the next Home load asks again
      });
    return () => {
      cancelled = true;
    };
  }, [classRole, isPreviewing, projectId, selectedClass]);

  const close = () => {
    if (invitedProject) settleMoveInInvite(invitedProject);
    setInvitedProject(null);
  };

  return (
    <ErrorBoundary fallback={null}>
      <MoveInModal open={invitedProject !== null && invitedProject === projectId && !held} onClose={close} teamName={teamName} />
    </ErrorBoundary>
  );
}
