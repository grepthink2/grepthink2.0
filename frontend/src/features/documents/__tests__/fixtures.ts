import type {
  ApiDocumentBodies,
  ApiDocumentDerivedSections,
  ApiDocumentInfo,
  ApiDocumentKind,
  ApiDocumentRevision,
  ApiDocumentRevisionEntry,
  ApiDocumentSlot,
  ApiDocumentSummary,
  ApiProjectDocument,
  ApiReleaseSummaryDerived,
  ApiScrumSprint,
  ApiSprintReportDerived,
  ApiTestReportDerived,
} from '@/lib/api';

/**
 * Shared document fixtures: every field of the API's shapes spelled out once, so a contract change
 * breaks one file. Ids are short names; the API's are UUIDs.
 */

export const makeSprint = (over: Partial<ApiScrumSprint> = {}): ApiScrumSprint => ({
  id: 'sp2', name: 'Sprint 2', starts_at: '2026-10-05', ends_at: '2026-10-18', status: 'completed', ...over,
});

const TITLES: Record<ApiDocumentKind, string> = {
  sprint_report: 'Sprint 2 report',
  release_summary: 'Release summary',
  test_report: 'Test plan and report',
};

export const makeInfo = (kind: ApiDocumentKind, over: Partial<ApiDocumentInfo> = {}): ApiDocumentInfo => ({
  id: 'd1',
  project_id: 'p1',
  kind,
  title: TITLES[kind],
  sprint: kind === 'sprint_report' ? makeSprint() : null,
  status: 'draft',
  head_revision: 3,
  finalized_revision: null,
  finalized_at: null,
  finalized_by: null,
  finalized_by_name: null,
  edited_since: false,
  created_at: '2026-11-10T17:00:00Z',
  updated_at: '2026-11-16T22:05:00Z',
  ...over,
});

export const makeRevision = (over: Partial<ApiDocumentRevision> = {}): ApiDocumentRevision => ({
  number: 3, saved_by: 'u2', saved_by_name: 'Alex Kim', saved_at: '2026-11-16T22:05:00Z', source: 'edit', finalized_at: null, ...over,
});

export const makeRevisionEntry = (over: Partial<ApiDocumentRevisionEntry> = {}): ApiDocumentRevisionEntry => ({
  ...makeRevision(), finalized: false, ...over,
});

export const EMPTY_BODIES: ApiDocumentBodies = {
  sprint_report: { stop: [], start: [], keep: [], satisfied_note: '' },
  release_summary: { key_story_ids: [], known_problems: [], follow_ups: [] },
  test_report: { scenarios: [], unit_tests: [], unit_tests_note: '' },
};

export const sprintReportDerived = (over: Partial<ApiSprintReportDerived> = {}): ApiSprintReportDerived => ({
  completed: [{ id: 's1', key: 'US-1', title: 'Trail search', points: 5, hours: 6 }],
  not_completed: [{ id: 's2', key: 'US-2', title: 'Offline maps', points: 8, hours: null }],
  as_of: '2026-10-18',
  stories_completed: 1,
  hours_completed: 6,
  days: 14,
  stories_per_day: 0.07,
  hours_per_day: 0.43,
  to_date: { sprints_counted: 2, stories_per_day: 0.11, hours_per_day: 0.5 },
  after_sprint: null,
  burnup: { unit: 'hours', labels: ['Oct 5', 'Oct 18'], scope: [10, 12], completed: [0, 6] },
  ...over,
});

export const releaseSummaryDerived = (over: Partial<ApiReleaseSummaryDerived> = {}): ApiReleaseSummaryDerived => ({
  key_stories: [],
  backlog: [{ id: 's2', key: 'US-2', title: 'Offline maps', points: 8, in_sprint: 'Sprint 2' }],
  ...over,
});

export const testReportDerived = (over: Partial<ApiTestReportDerived> = {}): ApiTestReportDerived => ({
  stories: {}, scenarios: [], repositories: ['https://github.com/team/trailhead'], uncovered: [], ...over,
});

const DERIVED: { [K in ApiDocumentKind]: () => ApiDocumentDerivedSections[K] } = {
  sprint_report: () => sprintReportDerived(),
  release_summary: () => releaseSummaryDerived(),
  test_report: () => testReportDerived(),
};

interface DocumentOver<K extends ApiDocumentKind> {
  document?: Partial<ApiDocumentInfo>;
  revision?: Partial<ApiDocumentRevision>;
  body?: ApiDocumentBodies[K];
  derived?: ApiDocumentDerivedSections[K];
  derived_frozen?: boolean;
  access?: 'member' | 'staff';
  can_write?: boolean;
  can_finalize?: boolean;
}

/** A draft at revision 3, its head, as a team member who may finalize reads it. */
export function makeDocument<K extends ApiDocumentKind>(kind: K, over: DocumentOver<K> = {}): ApiProjectDocument<K> {
  return {
    document: { ...makeInfo(kind), ...over.document, kind } as ApiDocumentInfo & { kind: K },
    revision: makeRevision(over.revision),
    body: over.body ?? structuredClone(EMPTY_BODIES[kind]),
    derived: over.derived ?? DERIVED[kind](),
    derived_frozen: over.derived_frozen ?? false,
    access: over.access ?? 'member',
    can_write: over.can_write ?? (over.access ?? 'member') === 'member',
    can_finalize: over.can_finalize ?? true,
  };
}

export const makeSummary = (over: Partial<ApiDocumentSummary> = {}): ApiDocumentSummary => ({
  id: 'd1', status: 'draft', head_revision: 3, finalized_revision: null, edited_since: false,
  updated_at: '2026-11-16T22:05:00Z', saved_by_name: 'Alex Kim', ...over,
});

export const makeSlot = (over: Partial<ApiDocumentSlot> = {}): ApiDocumentSlot => ({
  kind: 'sprint_report', title: 'Sprint 2 report', sprint: makeSprint(), document: null, ...over,
});
