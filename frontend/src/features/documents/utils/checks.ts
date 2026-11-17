import type {
  ApiDocumentBodies,
  ApiDocumentKind,
  ApiReleaseSummaryBody,
  ApiSprintReportBody,
  ApiTestReportBody,
} from '@/lib/api';
import { ACTION_LISTS, prepareBody } from './documentBody';

/*
 * What holds back a finalize: the sentences of backend/app/documents/derive.py, word for word, so the
 * panel and a refused finalize (409, the first failure) say the same thing.
 */
export const SPRINT_NOT_ENDED = 'The sprint has not ended yet';
export const NEED_START = 'Add at least one action to start doing';
export const NEED_KEEP = 'Add at least one action to keep doing';
export const NEED_STOP = 'Add an action to stop doing, or say why there is none';
export const NEED_KEY_STORY = 'Pick at least one key story';
export const NEED_CRITERIA = 'Every key story needs acceptance criteria';
export const NEED_SCENARIO = 'Add at least one test scenario';
export const NEED_RESULTS = 'Mark every scenario as passed or failed';

/** A check that fails: `blocking` holds back a finalize, a `warning` never does. */
export interface DocumentCheck {
  severity: 'blocking' | 'warning';
  message: string;
}

/** What the checks know of a board story the body names. */
export interface StoryFacts {
  key: string;
  acceptance_criteria: string[];
  /** At least one task, every task done; null when not known. */
  completed: boolean | null;
}

/** What the checks read beside the body. */
export interface CheckInputs {
  /**
   * A sprint report's sprint has ended at the school: the API's `sprint.status` is `completed` from the
   * day after its last day there. Null when the page cannot tell: the API then says it at finalize.
   */
  sprintEnded?: boolean | null;
  /** A story the body names: its facts, `missing` once deleted from the board, undefined when not known. */
  story?: (id: string) => StoryFacts | 'missing' | undefined;
  /** The stories with criteria that no saved scenario covers (`derived.uncovered`), in board order. */
  uncovered?: { id: string; key: string; title: string }[];
}

/** The messages as checks of one severity. */
const checksOf = (severity: DocumentCheck['severity'], messages: string[]): DocumentCheck[] =>
  messages.map((message) => ({ severity, message }));

/** "US-2", "US-2 and US-5", "US-2, US-5 and US-7". */
function joinKeys(keys: string[]): string {
  if (keys.length <= 1) return keys.join('');
  return `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
}

function sprintReportChecks(body: ApiSprintReportBody, inputs: CheckInputs): DocumentCheck[] {
  const blocking: string[] = [];
  if (inputs.sprintEnded === false) blocking.push(SPRINT_NOT_ENDED);
  if (body.start.length === 0) blocking.push(NEED_START);
  if (body.keep.length === 0) blocking.push(NEED_KEEP);
  if (body.stop.length === 0 && !body.satisfied_note.trim()) blocking.push(NEED_STOP);
  const warnings = ACTION_LISTS.flatMap(({ key, label }) => body[key]
    .filter((item) => !item.reason.trim())
    .map((item) => `“${item.action}” (${label}) has no reason`));
  return [...checksOf('blocking', blocking), ...checksOf('warning', warnings)];
}

function releaseSummaryChecks(body: ApiReleaseSummaryBody, inputs: CheckInputs): DocumentCheck[] {
  const blocking: string[] = [];
  if (body.key_story_ids.length === 0) blocking.push(NEED_KEY_STORY);
  const facts = body.key_story_ids.map((id) => inputs.story?.(id));
  if (facts.some((f) => f === 'missing' || (f !== undefined && f.acceptance_criteria.length === 0))) {
    blocking.push(NEED_CRITERIA);
  }
  const warnings = facts
    .filter((f): f is StoryFacts => f !== undefined && f !== 'missing' && f.completed === false)
    .map((f) => `${f.key} is a key story but is not completed`);
  return [...checksOf('blocking', blocking), ...checksOf('warning', warnings)];
}

function testReportChecks(body: ApiTestReportBody, inputs: CheckInputs): DocumentCheck[] {
  const blocking: string[] = [];
  if (body.scenarios.length === 0) blocking.push(NEED_SCENARIO);
  if (body.scenarios.some((s) => s.result === null)) blocking.push(NEED_RESULTS);
  const warnings: string[] = [];
  for (const scenario of body.scenarios) {
    if (scenario.result === 'fail' && !scenario.note) warnings.push(`Scenario “${scenario.title}” failed and has no note`);
    if (scenario.story_ids.length === 0) warnings.push(`Scenario “${scenario.title}” covers no story`);
  }
  // The saved scenarios decided `uncovered`; a story an unsaved scenario names is covered already.
  const covered = new Set(body.scenarios.flatMap((s) => s.story_ids));
  const uncovered = (inputs.uncovered ?? []).filter((s) => !covered.has(s.id));
  if (uncovered.length) {
    warnings.push(`No scenario covers the acceptance criteria of ${joinKeys(uncovered.map((s) => s.key))}`);
  }
  for (const entry of body.unit_tests) {
    if (entry.failing) warnings.push(`Unit tests at ${entry.location} are failing`);
  }
  return [...checksOf('blocking', blocking), ...checksOf('warning', warnings)];
}

/**
 * The checks on a body as a save would send it (rows with nothing typed do not count): the blocking
 * ones first, in the order the API runs them, then the warnings, which never block. Pure.
 */
export function documentChecks<K extends ApiDocumentKind>(
  kind: K, body: ApiDocumentBodies[K], inputs: CheckInputs = {},
): DocumentCheck[] {
  const saved = prepareBody(kind, body).body;
  if (kind === 'sprint_report') return sprintReportChecks(saved as ApiSprintReportBody, inputs);
  if (kind === 'release_summary') return releaseSummaryChecks(saved as ApiReleaseSummaryBody, inputs);
  return testReportChecks(saved as ApiTestReportBody, inputs);
}

/** The first check that holds back a finalize, or null when none does. */
export function firstBlocking(checks: DocumentCheck[]): DocumentCheck | null {
  return checks.find((c) => c.severity === 'blocking') ?? null;
}
