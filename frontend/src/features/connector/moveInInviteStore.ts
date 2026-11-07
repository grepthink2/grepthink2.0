/**
 * The teams the student Home is done inviting to move in for this visit (a browser tab's session):
 * the student closed the invitation, or the board already holds enough stories. It is kept in
 * sessionStorage, so the next visit asks again.
 */
const storageKey = (projectId: string) => `gt.scrum.moveInInviteSettled.${projectId}`;

/** This page's own record, so storage that is blocked or full still settles a team until a reload. */
const settledHere = new Set<string>();

export function isMoveInInviteSettled(projectId: string): boolean {
  if (settledHere.has(projectId)) return true;
  try {
    return sessionStorage.getItem(storageKey(projectId)) !== null;
  } catch {
    return false;
  }
}

export function settleMoveInInvite(projectId: string): void {
  settledHere.add(projectId);
  try {
    sessionStorage.setItem(storageKey(projectId), '1');
  } catch {
    // blocked or full: settledHere carries it for the rest of this page's life
  }
}
