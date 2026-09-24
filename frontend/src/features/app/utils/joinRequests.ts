/**
 * Project join requests and team invites: who may review them, how the other
 * party is shown, and API rows -> UI rows. Shared by the student home dashboard
 * and the requests modal.
 */
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { ApiIncomingJoinRequest, ApiProjectJoinRequest } from '@/lib/api';

/** Project roles that may accept or deny a student's request to join. */
export const JOIN_REVIEW_ROLES = new Set(['owner', 'product owner', 'admin']);

export function canReviewJoinRequests(role: string | null | undefined): boolean {
  if (role == null || role === '') return false;
  return JOIN_REVIEW_ROLES.has(role.trim().toLowerCase());
}

export function initialsFromEmail(email: string | undefined): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  const tokens = local.split(/[._-]+/).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || '?';
}

export function displayNameFromEmail(email: string | undefined): string {
  if (!email) return 'Member';
  const local = email.split('@')[0] ?? 'Member';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Predates the --gt-* design-token system: the no-email fallback below
// happens to match --gt-primary but is a literal left over from before the
// token sweep (this function otherwise returns a computed `hsl(...)` string,
// not a token reference). Left as-is rather than churned as a side effect
// of wiring the adherence lint.
export function avatarBgFromEmail(email: string | undefined): string {
  if (!email) return '#018156';
  let h = 0;
  for (let i = 0; i < email.length; i += 1) {
    h = (h + email.charCodeAt(i) * (i + 1)) % 360;
  }
  return `hsl(${h} 42% 40%)`;
}

export function formatRequestedMeta(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return `Requested ${formatDistanceToNow(parseISO(iso), { addSuffix: true })}`;
  } catch {
    return null;
  }
}

export function formatAwaitingMeta(iso: string | undefined): string | null {
  if (!iso) return 'Awaiting Response';
  try {
    return `Awaiting Response • ${formatDistanceToNow(parseISO(iso), { addSuffix: true })}`;
  } catch {
    return 'Awaiting Response';
  }
}

export type IncomingRequestKind = 'join_request' | 'team_invite';

/** Something waiting on the viewer: a join request on a team they review, or an invite to a team. */
export interface IncomingRequestRow {
  requestId: string;
  projectId: string;
  projectName: string;
  kind: IncomingRequestKind;
  counterpartyEmail?: string;
  requestedAt?: string;
  memberCount: number;
  message?: string | null;
}

/** A join request the viewer sent. */
export interface OutgoingRequestRow {
  requestId: string;
  projectId: string;
  projectName: string;
  courseLabel?: string;
  memberCount: number;
  sponsorCompany?: string;
  requestedAt?: string;
  status?: string;
  imageUrl?: string | null;
}

const requestedAtMs = (row: { requestedAt?: string }): number =>
  row.requestedAt ? parseISO(row.requestedAt).getTime() : 0;

/** Join requests on teams the viewer reviews plus invites to the viewer, oldest first. */
export function incomingRowsFromApi(
  joinRequests: ApiIncomingJoinRequest[],
  teamInvites: ApiProjectJoinRequest[],
): IncomingRequestRow[] {
  const rows: IncomingRequestRow[] = [
    ...joinRequests.map(
      (r): IncomingRequestRow => ({
        requestId: r.request_id,
        projectId: r.project_id,
        projectName: r.project_name,
        kind: 'join_request',
        counterpartyEmail: r.email,
        requestedAt: r.requested_at,
        memberCount: r.member_count ?? 0,
        message: r.message,
      }),
    ),
    ...teamInvites.map(
      (r): IncomingRequestRow => ({
        requestId: r.request_id,
        projectId: r.project_id ?? '',
        projectName: r.project_name ?? 'Project',
        kind: 'team_invite',
        counterpartyEmail: r.email,
        requestedAt: r.requested_at,
        memberCount: r.member_count ?? 0,
      }),
    ),
  ];
  return rows.sort((a, b) => requestedAtMs(a) - requestedAtMs(b));
}

export function outgoingRowsFromApi(requests: ApiProjectJoinRequest[]): OutgoingRequestRow[] {
  return requests.map((r) => ({
    requestId: r.request_id,
    projectId: r.project_id ?? '',
    projectName: r.project_name ?? 'Project',
    courseLabel: r.course_label,
    memberCount: r.member_count ?? 0,
    sponsorCompany: r.sponsor_company,
    requestedAt: r.requested_at,
    status: r.status,
    imageUrl: r.image_url,
  }));
}
