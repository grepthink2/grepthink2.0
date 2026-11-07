import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { api } from '@/lib/api';
import { API_BASE_URL } from '@/lib/api/client';
import { useClass, useSelectedClassRole } from '@/lib/classContext';
import { getClassDisplayStatus } from '@/lib/classLifecycle';
import { lazyModal } from '@/lib/lazyModal';
import { usePreview } from '@/lib/previewContext';
import { connectorUrl } from '@features/scrum/utils/connectorUrl';
import { isMoveInInviteSettled, settleMoveInInvite } from '../moveInInviteStore';

// The student Home ships in the entry chunk, so the modal and its copy load the first time it opens.
const MoveInModal = lazyModal(() => import('./MoveInModal'), (p) => p.open);

/** A team whose board holds fewer stories than this, imported ones included, is invited to move it in. */
const MOVE_IN_INVITE_BELOW = 3;

/**
 * Whether a modal dialog is up: Settings, Join class, the search palette, the requests, or the
 * invitation itself. The invitation never opens over or under another one.
 */
const aDialogIsOpen = () => document.querySelector('[aria-modal="true"]') !== null;

/**
 * Opens the move-in invitation on the student Home while the team's board holds fewer than
 * MOVE_IN_INVITE_BELOW stories and an assistant can reach the connector, until the visit settles
 * the team (see moveInInviteStore). Students only: TAs share this Home, and an instructor
 * previewing the class has no team. Never in a finished class. The invitation is optional: a
 * failed read, another dialog in the way, or a modal that cannot load shows nothing, and the next
 * Home load asks again.
 */
export default function MoveInInvite({ projectId, teamName }: { projectId: string | null; teamName?: string }) {
  const classRole = useSelectedClassRole();
  const { selectedClass } = useClass();
  const { isPreviewing } = usePreview();
  const [invitedProject, setInvitedProject] = useState<string | null>(null);

  // Another team starts uninvited: only an answer about it may open the invitation.
  const [teamShown, setTeamShown] = useState(projectId);
  if (teamShown !== projectId) {
    setTeamShown(projectId);
    setInvitedProject(null);
  }

  const applies = classRole === 'student' && !isPreviewing && Boolean(selectedClass);

  useEffect(() => {
    if (!applies || !projectId || !selectedClass) return;
    if (isMoveInInviteSettled(projectId) || getClassDisplayStatus(selectedClass) === 'complete') return;

    let cancelled = false;
    api
      .getScrumSummary(projectId)
      .then(({ story_count: stories, connector_ready: ready }) => {
        // A backend older than this client sends no count, and then nothing opens.
        if (cancelled || stories === undefined) return;
        if (stories >= MOVE_IN_INVITE_BELOW) {
          settleMoveInInvite(projectId);
          setInvitedProject(null);
        } else if (!ready || isMoveInInviteSettled(projectId)) {
          // The connector can't be reached, or the student closed the invitation while this read was out.
          setInvitedProject(null);
        } else {
          const blocked = aDialogIsOpen();
          // An open invitation stays open; a new one waits for a Home load with no other dialog up.
          setInvitedProject((current) => (current === projectId || !blocked ? projectId : null));
        }
      })
      .catch(() => {
        // nothing to show; the next Home load asks again
      });
    return () => {
      cancelled = true;
    };
  }, [applies, projectId, selectedClass]);

  const close = () => {
    if (invitedProject) settleMoveInInvite(invitedProject);
    setInvitedProject(null);
  };

  return (
    <ErrorBoundary fallback={null}>
      <MoveInModal
        // The modal stays mounted once it has opened; keyed by team, another team's starts fresh.
        key={projectId ?? 'no-team'}
        open={applies && projectId !== null && invitedProject === projectId}
        onClose={close}
        teamName={teamName}
        // Built here, in the entry chunk: when the modal's chunk imported lib/api/client itself,
        // rolldown moved that module out of the entry into a file of its own that every page preloads.
        connectorAddress={connectorUrl(API_BASE_URL, window.location.origin)}
      />
    </ErrorBoundary>
  );
}
