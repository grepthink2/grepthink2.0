import { describe, expect, it } from 'vitest';
import type { ApiClassDocument } from '@/lib/api';
import { handInsByTeam } from '../utils/handIns';

const row = (projectId: string, status: 'draft' | 'final', editedSince = false): ApiClassDocument => ({
  id: `${projectId}-${status}-${editedSince}`, kind: 'release_summary', title: 'Release summary', project_id: projectId,
  project_name: projectId, sprint_name: null, status, head_revision: 3, finalized_revision: status === 'final' ? 2 : null,
  edited_since: editedSince, updated_at: '2026-11-16T10:00:00Z',
});

describe('handInsByTeam', () => {
  it("counts each team's documents and the ones handed in, edited since or not", () => {
    const counts = handInsByTeam([row('p1', 'final'), row('p1', 'draft'), row('p1', 'final', true), row('p2', 'draft')]);
    expect(counts.get('p1')).toEqual({ handedIn: 2, total: 3 });
    expect(counts.get('p2')).toEqual({ handedIn: 0, total: 1 });
    expect(counts.get('p3')).toBeUndefined();
  });
});
