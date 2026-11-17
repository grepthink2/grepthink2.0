import type {
  ApiDocumentBodies,
  ApiDocumentKind,
  ApiFollowUp,
  ApiKnownProblem,
  ApiKnownProblemKind,
  ApiReleaseSummaryBody,
  ApiSprintAction,
  ApiSprintReportBody,
  ApiTestReportBody,
  ApiTestScenario,
  ApiUnitTestEntry,
} from '@/lib/api';
import {
  ACTION_MAX,
  ACTIONS_MAX,
  BODY_BYTES_MAX,
  FOLLOW_UP_MAX,
  FOLLOW_UPS_MAX,
  KEY_STORIES_MAX,
  KNOWN_PROBLEMS_MAX,
  LOCATION_MAX,
  NOTE_MAX,
  PROBLEM_MAX,
  REASON_MAX,
  SATISFIED_NOTE_MAX,
  SCENARIO_STORIES_MAX,
  SCENARIO_TITLE_MAX,
  SCENARIOS_MAX,
  STEPS_MAX,
  UNIT_TESTS_MAX,
  UNIT_TESTS_NOTE_MAX,
} from '../config/limits';

/** The sentence the API answers for a body past its size, which the page also says before sending one. */
export const TOO_LONG = 'This document is too long';

/** A new item's id: every item of a body carries a UUID the web client makes. */
export function newId(): string {
  return crypto.randomUUID();
}

export const newAction = (): ApiSprintAction => ({ id: newId(), action: '', reason: '' });
export const newKnownProblem = (kind: ApiKnownProblemKind = 'bug'): ApiKnownProblem => ({ id: newId(), kind, text: '' });
export const newFollowUp = (): ApiFollowUp => ({ id: newId(), text: '' });
export const newUnitTest = (): ApiUnitTestEntry => ({ id: newId(), location: '', note: '', failing: false });
export const newScenario = (over: Partial<Omit<ApiTestScenario, 'id'>> = {}): ApiTestScenario => ({
  id: newId(), title: '', story_ids: [], steps_md: '', result: null, note: '', ...over,
});

/** The sprint report's three lists of actions, in the template's order, with their names on the page. */
export const ACTION_LISTS = [
  { key: 'stop', label: 'Stop doing' },
  { key: 'start', label: 'Start doing' },
  { key: 'keep', label: 'Keep doing' },
] as const;
export type ActionListKey = (typeof ACTION_LISTS)[number]['key'];

/** A known problem's kinds, as the page names them. */
export const PROBLEM_KIND_LABELS: Record<ApiKnownProblemKind, string> = {
  bug: 'Bug',
  omission: 'Omission',
  shortcut: 'Design shortcut',
};

/** The board story a scenario is made for: its "Add a scenario for it" and the seed's. */
export interface StoryForScenario {
  id: string;
  key: string;
  title: string;
  acceptance_criteria: string[];
}

/**
 * The criteria as numbered steps, as many whole ones as fit a scenario's steps: the seed's rule
 * (`derive._numbered`), each criterion's whitespace collapsed.
 */
export function numberedSteps(criteria: string[]): string {
  const lines: string[] = [];
  let size = 0;
  for (const [i, criterion] of criteria.entries()) {
    const item = `${i + 1}. ${criterion.split(/\s+/).filter(Boolean).join(' ')}`;
    const grown = size + item.length + (lines.length ? 1 : 0);
    if (grown > STEPS_MAX) break;
    lines.push(item);
    size = grown;
  }
  return lines.join('\n');
}

/** A scenario for one story, as the seed makes them: titled after it (its key when untitled), its criteria as steps, not yet run. */
export function scenarioFor(story: StoryForScenario): ApiTestScenario {
  return newScenario({
    title: story.title.slice(0, SCENARIO_TITLE_MAX).trim() || story.key,
    story_ids: [story.id],
    steps_md: numberedSteps(story.acceptance_criteria),
  });
}

// ----- Saving ---------------------------------------------------------------------------------------

/** What a body is saved as, and why it can't be yet. */
export interface PreparedBody<K extends ApiDocumentKind = ApiDocumentKind> {
  /** Every text trimmed, the blank items dropped and each story named once: what the API takes. */
  body: ApiDocumentBodies[K];
  /** Why the API would refuse it, each naming the field; empty when it can be saved. */
  problems: string[];
}

const blank = (text: string) => text.trim() === '';
/** Past `max` once trimmed, as the API measures it. */
const over = (text: string, max: number) => text.trim().length > max;
/** Each id once, in the order first named. */
const once = (ids: string[]) => [...new Set(ids)];

function prepareSprintReport(body: ApiSprintReportBody): PreparedBody<'sprint_report'> {
  const problems: string[] = [];
  const lists = { stop: [], start: [], keep: [] } as Record<ActionListKey, ApiSprintAction[]>;
  for (const { key, label } of ACTION_LISTS) {
    body[key].forEach((item, i) => {
      // A row with nothing typed counts for nothing: it is dropped, as a blank criterion is.
      if (blank(item.action) && blank(item.reason)) return;
      const where = `${label} ${i + 1}`;
      if (blank(item.action)) problems.push(`${where} needs an action`);
      else if (over(item.action, ACTION_MAX)) problems.push(`${where}: the action is over ${ACTION_MAX} characters`);
      if (over(item.reason, REASON_MAX)) problems.push(`${where}: the reason is over ${REASON_MAX} characters`);
      lists[key].push({ id: item.id, action: item.action.trim(), reason: item.reason.trim() });
    });
    if (lists[key].length > ACTIONS_MAX) problems.push(`${label} holds at most ${ACTIONS_MAX} actions`);
  }
  if (over(body.satisfied_note, SATISFIED_NOTE_MAX)) {
    problems.push(`Why there is nothing to stop doing is over ${SATISFIED_NOTE_MAX} characters`);
  }
  return { body: { ...lists, satisfied_note: body.satisfied_note.trim() }, problems };
}

function prepareReleaseSummary(body: ApiReleaseSummaryBody): PreparedBody<'release_summary'> {
  const problems: string[] = [];
  const keyStoryIds = once(body.key_story_ids);
  if (keyStoryIds.length > KEY_STORIES_MAX) problems.push(`Key stories hold at most ${KEY_STORIES_MAX} stories`);
  const knownProblems: ApiKnownProblem[] = [];
  body.known_problems.forEach((item, i) => {
    if (blank(item.text)) return;
    if (over(item.text, PROBLEM_MAX)) problems.push(`Known problem ${i + 1} is over ${PROBLEM_MAX} characters`);
    knownProblems.push({ id: item.id, kind: item.kind, text: item.text.trim() });
  });
  if (knownProblems.length > KNOWN_PROBLEMS_MAX) problems.push(`Known problems hold at most ${KNOWN_PROBLEMS_MAX}`);
  const followUps: ApiFollowUp[] = [];
  body.follow_ups.forEach((item, i) => {
    if (blank(item.text)) return;
    if (over(item.text, FOLLOW_UP_MAX)) problems.push(`Follow-up ${i + 1} is over ${FOLLOW_UP_MAX} characters`);
    followUps.push({ id: item.id, text: item.text.trim() });
  });
  if (followUps.length > FOLLOW_UPS_MAX) problems.push(`Follow-ups hold at most ${FOLLOW_UPS_MAX}`);
  return { body: { key_story_ids: keyStoryIds, known_problems: knownProblems, follow_ups: followUps }, problems };
}

function prepareTestReport(body: ApiTestReportBody): PreparedBody<'test_report'> {
  const problems: string[] = [];
  const scenarios: ApiTestScenario[] = [];
  body.scenarios.forEach((item, i) => {
    const storyIds = once(item.story_ids);
    const empty = blank(item.title) && blank(item.steps_md) && blank(item.note)
      && storyIds.length === 0 && item.result === null;
    if (empty) return;
    const where = `Scenario ${i + 1}`;
    if (blank(item.title)) problems.push(`${where} needs a title`);
    else if (over(item.title, SCENARIO_TITLE_MAX)) problems.push(`${where}: the title is over ${SCENARIO_TITLE_MAX} characters`);
    if (storyIds.length > SCENARIO_STORIES_MAX) problems.push(`${where} covers at most ${SCENARIO_STORIES_MAX} stories`);
    if (over(item.steps_md, STEPS_MAX)) problems.push(`${where}: the steps are over ${STEPS_MAX} characters`);
    if (over(item.note, NOTE_MAX)) problems.push(`${where}: the note is over ${NOTE_MAX} characters`);
    scenarios.push({
      id: item.id,
      title: item.title.trim(),
      story_ids: storyIds,
      steps_md: item.steps_md.trim(),
      result: item.result,
      note: item.note.trim(),
    });
  });
  if (scenarios.length > SCENARIOS_MAX) problems.push(`Scenarios hold at most ${SCENARIOS_MAX}`);
  const unitTests: ApiUnitTestEntry[] = [];
  body.unit_tests.forEach((item, i) => {
    if (blank(item.location) && blank(item.note) && !item.failing) return;
    const where = `Unit tests ${i + 1}`;
    if (blank(item.location)) problems.push(`${where} needs a location`);
    else if (over(item.location, LOCATION_MAX)) problems.push(`${where}: the location is over ${LOCATION_MAX} characters`);
    if (over(item.note, NOTE_MAX)) problems.push(`${where}: the note is over ${NOTE_MAX} characters`);
    unitTests.push({ id: item.id, location: item.location.trim(), note: item.note.trim(), failing: item.failing });
  });
  if (unitTests.length > UNIT_TESTS_MAX) problems.push(`Unit tests hold at most ${UNIT_TESTS_MAX} entries`);
  if (over(body.unit_tests_note, UNIT_TESTS_NOTE_MAX)) {
    problems.push(`The note on the unit tests is over ${UNIT_TESTS_NOTE_MAX} characters`);
  }
  return {
    body: { scenarios, unit_tests: unitTests, unit_tests_note: body.unit_tests_note.trim() },
    problems,
  };
}

/** The bytes a body takes as compact UTF-8 JSON, as the API measures it. */
export function bodyBytes(body: unknown): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

/**
 * The body as a save sends it, and what stops the save: every text trimmed, the items with nothing
 * typed dropped, each story named once; a required text left blank, a text or a list past its limit,
 * or a body too long to store, each named. The page refuses to save while `problems` holds any.
 */
export function prepareBody<K extends ApiDocumentKind>(kind: K, body: ApiDocumentBodies[K]): PreparedBody<K> {
  const prepared = kind === 'sprint_report'
    ? prepareSprintReport(body as ApiSprintReportBody)
    : kind === 'release_summary'
      ? prepareReleaseSummary(body as ApiReleaseSummaryBody)
      : prepareTestReport(body as ApiTestReportBody);
  if (prepared.problems.length === 0 && bodyBytes(prepared.body) > BODY_BYTES_MAX) {
    prepared.problems.push(TOO_LONG);
  }
  return prepared as PreparedBody<K>;
}

/** A value with its object keys sorted, so two equal bodies print the same. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Whether two bodies hold the same things, whatever the order of their keys. */
export function bodiesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Whether `working` would save anything other than `saved`: blank items and whitespace aside. */
export function bodyChanged<K extends ApiDocumentKind>(
  kind: K, working: ApiDocumentBodies[K], saved: ApiDocumentBodies[K],
): boolean {
  return !bodiesEqual(prepareBody(kind, working).body, prepareBody(kind, saved).body);
}

// ----- The board's stories a body names -------------------------------------------------------------

/** Every board story the body names: the release summary's key stories, the test report's scenarios'. */
export function storyIdsOf<K extends ApiDocumentKind>(kind: K, body: ApiDocumentBodies[K]): string[] {
  if (kind === 'release_summary') return once((body as ApiReleaseSummaryBody).key_story_ids);
  if (kind === 'test_report') return once((body as ApiTestReportBody).scenarios.flatMap((s) => s.story_ids));
  return [];
}

/** A body without the stories `missing` names, and the places on the page that lost one. */
export function withoutStories<K extends ApiDocumentKind>(
  kind: K, body: ApiDocumentBodies[K], missing: ReadonlySet<string>,
): { body: ApiDocumentBodies[K]; changed: string[] } {
  if (kind === 'release_summary') {
    const summary = body as ApiReleaseSummaryBody;
    const kept = summary.key_story_ids.filter((id) => !missing.has(id));
    const changed = kept.length === summary.key_story_ids.length ? [] : ['Key stories'];
    return { body: { ...summary, key_story_ids: kept } as ApiDocumentBodies[K], changed };
  }
  if (kind === 'test_report') {
    const report = body as ApiTestReportBody;
    const changed: string[] = [];
    const scenarios = report.scenarios.map((scenario, i) => {
      const kept = scenario.story_ids.filter((id) => !missing.has(id));
      if (kept.length === scenario.story_ids.length) return scenario;
      changed.push(scenario.title.trim() ? `Scenario ${i + 1} (“${scenario.title.trim()}”)` : `Scenario ${i + 1}`);
      return { ...scenario, story_ids: kept };
    });
    return { body: { ...report, scenarios } as ApiDocumentBodies[K], changed };
  }
  return { body, changed: [] };
}
