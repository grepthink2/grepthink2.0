import { describe, expect, it } from 'vitest';
import type { ApiReleaseSummaryBody, ApiSprintReportBody, ApiTestReportBody, ApiTestScenario } from '@/lib/api';
import {
  documentChecks,
  firstBlocking,
  NEED_CRITERIA,
  NEED_KEEP,
  NEED_KEY_STORY,
  NEED_RESULTS,
  NEED_SCENARIO,
  NEED_START,
  NEED_STOP,
  SPRINT_NOT_ENDED,
  type StoryFacts,
} from '../utils/checks';

const action = (id: string, text: string, reason = 'because') => ({ id, action: text, reason });
/** A sprint report every blocking check passes. */
const report = (over: Partial<ApiSprintReportBody> = {}): ApiSprintReportBody => ({
  stop: [action('a', 'Skip standups')], start: [action('b', 'Pair')], keep: [action('c', 'Review')], satisfied_note: '', ...over,
});
const summary = (over: Partial<ApiReleaseSummaryBody> = {}): ApiReleaseSummaryBody => ({
  key_story_ids: ['s1'], known_problems: [], follow_ups: [], ...over,
});
const scenario = (over: Partial<ApiTestScenario> = {}): ApiTestScenario => ({
  id: 'sc1', title: 'Log in', story_ids: ['s1'], steps_md: '', result: 'pass', note: '', ...over,
});
const tests = (over: Partial<ApiTestReportBody> = {}): ApiTestReportBody => ({
  scenarios: [scenario()], unit_tests: [], unit_tests_note: '', ...over,
});

const messages = (checks: { message: string }[]) => checks.map((c) => c.message);
const blocking = (checks: { severity: string; message: string }[]) => messages(checks.filter((c) => c.severity === 'blocking'));
const warnings = (checks: { severity: string; message: string }[]) => messages(checks.filter((c) => c.severity === 'warning'));

describe('sprint report checks', () => {
  it('pass for a report with an action in each list, on an ended sprint', () => {
    expect(documentChecks('sprint_report', report(), { sprintEnded: true })).toEqual([]);
  });

  it('hold back a sprint that has not ended, and leave it to the API when the page cannot tell', () => {
    expect(blocking(documentChecks('sprint_report', report(), { sprintEnded: false }))).toEqual([SPRINT_NOT_ENDED]);
    expect(documentChecks('sprint_report', report(), { sprintEnded: null })).toEqual([]);
  });

  it('need an action to start doing', () => {
    expect(blocking(documentChecks('sprint_report', report({ start: [] })))).toEqual([NEED_START]);
  });

  it('need an action to keep doing', () => {
    expect(blocking(documentChecks('sprint_report', report({ keep: [] })))).toEqual([NEED_KEEP]);
  });

  it('need an action to stop doing, or the note that says why there is none', () => {
    expect(blocking(documentChecks('sprint_report', report({ stop: [] })))).toEqual([NEED_STOP]);
    expect(blocking(documentChecks('sprint_report', report({ stop: [], satisfied_note: 'Nothing slowed us' })))).toEqual([]);
  });

  it('count no row with nothing typed in it', () => {
    expect(blocking(documentChecks('sprint_report', report({ start: [action('b', ' ', ' ')] })))).toEqual([NEED_START]);
  });

  it('run in the order the API does, so the first is the one a finalize answers', () => {
    const checks = documentChecks('sprint_report', report({ start: [], keep: [], stop: [] }), { sprintEnded: false });
    expect(blocking(checks)).toEqual([SPRINT_NOT_ENDED, NEED_START, NEED_KEEP, NEED_STOP]);
    expect(firstBlocking(checks)?.message).toBe(SPRINT_NOT_ENDED);
  });

  it('warn of an action with no reason, and never block on it', () => {
    const checks = documentChecks('sprint_report', report({ keep: [action('c', 'Review', ' ')] }), { sprintEnded: true });
    expect(checks).toEqual([{ severity: 'warning', message: '“Review” (Keep doing) has no reason' }]);
    expect(firstBlocking(checks)).toBeNull();
  });
});

describe('release summary checks', () => {
  const facts = (over: Partial<StoryFacts> = {}): StoryFacts => ({ key: 'US-1', acceptance_criteria: ['Works'], completed: true, ...over });

  it('pass for a completed key story with criteria', () => {
    expect(documentChecks('release_summary', summary(), { story: () => facts() })).toEqual([]);
  });

  it('need a key story', () => {
    expect(blocking(documentChecks('release_summary', summary({ key_story_ids: [] })))).toEqual([NEED_KEY_STORY]);
  });

  it('need criteria on every key story, and a deleted one has none', () => {
    expect(blocking(documentChecks('release_summary', summary(), { story: () => facts({ acceptance_criteria: [] }) }))).toEqual([NEED_CRITERIA]);
    expect(blocking(documentChecks('release_summary', summary(), { story: () => 'missing' }))).toEqual([NEED_CRITERIA]);
  });

  it('leave a story it knows nothing of to the API', () => {
    expect(documentChecks('release_summary', summary(), { story: () => undefined })).toEqual([]);
  });

  it('warn of a key story that is not completed', () => {
    expect(documentChecks('release_summary', summary(), { story: () => facts({ completed: false }) })).toEqual([
      { severity: 'warning', message: 'US-1 is a key story but is not completed' },
    ]);
  });
});

describe('test report checks', () => {
  it('pass for a passed scenario that covers a story', () => {
    expect(documentChecks('test_report', tests())).toEqual([]);
  });

  it('need a scenario', () => {
    expect(blocking(documentChecks('test_report', tests({ scenarios: [] })))).toEqual([NEED_SCENARIO]);
  });

  it('need a result on every scenario', () => {
    expect(blocking(documentChecks('test_report', tests({ scenarios: [scenario(), scenario({ id: 'sc2', result: null })] })))).toEqual([NEED_RESULTS]);
  });

  it('warn of a failed scenario with no note', () => {
    expect(warnings(documentChecks('test_report', tests({ scenarios: [scenario({ result: 'fail' })] })))).toEqual([
      'Scenario “Log in” failed and has no note',
    ]);
    expect(warnings(documentChecks('test_report', tests({ scenarios: [scenario({ result: 'fail', note: 'Bug #4' })] })))).toEqual([]);
  });

  it('warn of a scenario that covers no story', () => {
    expect(warnings(documentChecks('test_report', tests({ scenarios: [scenario({ story_ids: [] })] })))).toEqual([
      'Scenario “Log in” covers no story',
    ]);
  });

  it('warn of stories with criteria no scenario covers, minus the ones an unsaved scenario names', () => {
    const uncovered = [{ id: 's1', key: 'US-1', title: 'A' }, { id: 's2', key: 'US-2', title: 'B' }, { id: 's3', key: 'US-3', title: 'C' }];
    expect(warnings(documentChecks('test_report', tests(), { uncovered }))).toEqual([
      'No scenario covers the acceptance criteria of US-2 and US-3',
    ]);
    expect(warnings(documentChecks('test_report', tests({ scenarios: [scenario({ story_ids: ['s1', 's2', 's3'] })] }), { uncovered }))).toEqual([]);
  });

  it('warn of unit tests marked failing', () => {
    const unit = { id: 'u', location: 'backend/tests', note: '', failing: true };
    expect(warnings(documentChecks('test_report', tests({ unit_tests: [unit] })))).toEqual(['Unit tests at backend/tests are failing']);
  });
});
