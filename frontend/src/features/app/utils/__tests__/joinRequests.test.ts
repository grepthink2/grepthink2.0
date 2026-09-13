import { describe, expect, it } from 'vitest';
import type { ApiIncomingJoinRequest, ApiProjectJoinRequest } from '@/lib/api';
import {
  avatarBgFromEmail,
  canReviewJoinRequests,
  displayNameFromEmail,
  formatAwaitingMeta,
  formatRequestedMeta,
  incomingRowsFromApi,
  initialsFromEmail,
  outgoingRowsFromApi,
} from '../joinRequests';

describe('canReviewJoinRequests', () => {
  it('accepts owner, product owner and admin regardless of case and padding', () => {
    expect(canReviewJoinRequests('owner')).toBe(true);
    expect(canReviewJoinRequests(' Product Owner ')).toBe(true);
    expect(canReviewJoinRequests('ADMIN')).toBe(true);
  });

  it('rejects other roles and missing roles', () => {
    expect(canReviewJoinRequests('member')).toBe(false);
    expect(canReviewJoinRequests('scrum master')).toBe(false);
    expect(canReviewJoinRequests('')).toBe(false);
    expect(canReviewJoinRequests(null)).toBe(false);
    expect(canReviewJoinRequests(undefined)).toBe(false);
  });
});

describe('email display helpers', () => {
  it('derives initials from the local part', () => {
    expect(initialsFromEmail('jane.doe@ucsc.edu')).toBe('JD');
    expect(initialsFromEmail('sam@ucsc.edu')).toBe('SA');
    expect(initialsFromEmail(undefined)).toBe('?');
  });

  it('derives a title-cased display name from the local part', () => {
    expect(displayNameFromEmail('jane_doe-smith@ucsc.edu')).toBe('Jane Doe Smith');
    expect(displayNameFromEmail(undefined)).toBe('Member');
  });

  it('gives a stable avatar colour per email and a fallback without one', () => {
    expect(avatarBgFromEmail('a@b.c')).toBe(avatarBgFromEmail('a@b.c'));
    expect(avatarBgFromEmail('a@b.c')).toMatch(/^hsl\(\d+ 42% 40%\)$/);
    expect(avatarBgFromEmail(undefined)).toBe('#018156');
  });
});

describe('request meta labels', () => {
  it('handles missing and unparseable timestamps', () => {
    expect(formatRequestedMeta(undefined)).toBeNull();
    expect(formatRequestedMeta('not a date')).toBeNull();
    expect(formatAwaitingMeta(undefined)).toBe('Awaiting Response');
    expect(formatAwaitingMeta('not a date')).toBe('Awaiting Response');
  });

  it('describes a timestamp relative to now', () => {
    const iso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRequestedMeta(iso)).toMatch(/^Requested .* ago$/);
    expect(formatAwaitingMeta(iso)).toMatch(/^Awaiting Response • .* ago$/);
  });
});

describe('incomingRowsFromApi', () => {
  const join = (over: Partial<ApiIncomingJoinRequest>): ApiIncomingJoinRequest => ({
    request_id: 'r',
    user_id: 'u',
    email: 'x@ucsc.edu',
    status: 'pending',
    requested_at: '2026-09-10T10:00:00Z',
    message: null,
    project_id: 'p1',
    project_name: 'Alpha',
    member_count: 3,
    ...over,
  });
  const invite = (over: Partial<ApiProjectJoinRequest>): ApiProjectJoinRequest => ({
    request_id: 'i',
    user_id: 'u2',
    email: 'y@ucsc.edu',
    status: 'pending',
    requested_at: '2026-09-09T10:00:00Z',
    project_id: 'p2',
    project_name: 'Beta',
    member_count: 4,
    ...over,
  });

  it('merges join requests and team invites, oldest first', () => {
    const rows = incomingRowsFromApi(
      [
        join({ request_id: 'j2', requested_at: '2026-09-11T00:00:00Z', message: 'hi' }),
        join({ request_id: 'j1', requested_at: '2026-09-10T00:00:00Z' }),
      ],
      [invite({ request_id: 'i1', requested_at: '2026-09-10T12:00:00Z' })],
    );
    expect(rows.map((r) => r.requestId)).toEqual(['j1', 'i1', 'j2']);
    expect(rows[2]).toEqual({
      requestId: 'j2',
      projectId: 'p1',
      projectName: 'Alpha',
      kind: 'join_request',
      counterpartyEmail: 'x@ucsc.edu',
      requestedAt: '2026-09-11T00:00:00Z',
      memberCount: 3,
      message: 'hi',
    });
    expect(rows[1]).toEqual({
      requestId: 'i1',
      projectId: 'p2',
      projectName: 'Beta',
      kind: 'team_invite',
      counterpartyEmail: 'y@ucsc.edu',
      requestedAt: '2026-09-10T12:00:00Z',
      memberCount: 4,
    });
  });

  it('puts rows without a timestamp first and fills invite defaults', () => {
    const rows = incomingRowsFromApi(
      [join({ request_id: 'j' })],
      [
        invite({
          request_id: 'i',
          requested_at: undefined,
          project_id: undefined,
          project_name: undefined,
          member_count: undefined,
        }),
      ],
    );
    expect(rows.map((r) => r.requestId)).toEqual(['i', 'j']);
    expect(rows[0]).toEqual({
      requestId: 'i',
      projectId: '',
      projectName: 'Project',
      kind: 'team_invite',
      counterpartyEmail: 'y@ucsc.edu',
      memberCount: 0,
    });
  });
});

describe('outgoingRowsFromApi', () => {
  it('maps my join requests with defaults for missing project details', () => {
    expect(
      outgoingRowsFromApi([
        {
          request_id: 'o1',
          user_id: 'me',
          status: 'pending',
          project_id: 'p',
          project_name: 'Gamma',
          course_label: 'CSE 115C',
          member_count: 2,
          sponsor_company: 'Acme',
          requested_at: '2026-09-01T00:00:00Z',
          image_url: null,
        },
        { request_id: 'o2', user_id: 'me', status: 'rejected' },
      ]),
    ).toEqual([
      {
        requestId: 'o1',
        projectId: 'p',
        projectName: 'Gamma',
        courseLabel: 'CSE 115C',
        memberCount: 2,
        sponsorCompany: 'Acme',
        requestedAt: '2026-09-01T00:00:00Z',
        status: 'pending',
        imageUrl: null,
      },
      { requestId: 'o2', projectId: '', projectName: 'Project', memberCount: 0, status: 'rejected' },
    ]);
  });
});
