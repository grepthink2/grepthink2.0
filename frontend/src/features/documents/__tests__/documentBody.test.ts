import { describe, expect, it } from 'vitest';
import type { ApiReleaseSummaryBody, ApiSprintReportBody, ApiTestReportBody } from '@/lib/api';
import {
  bodiesEqual,
  bodyChanged,
  newAction,
  newFollowUp,
  newKnownProblem,
  newScenario,
  newUnitTest,
  numberedSteps,
  prepareBody,
  scenarioFor,
  storyIdsOf,
  TOO_LONG,
  withoutStories,
} from '../utils/documentBody';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sprintReport = (over: Partial<ApiSprintReportBody> = {}): ApiSprintReportBody => ({
  stop: [], start: [], keep: [], satisfied_note: '', ...over,
});
const releaseSummary = (over: Partial<ApiReleaseSummaryBody> = {}): ApiReleaseSummaryBody => ({
  key_story_ids: [], known_problems: [], follow_ups: [], ...over,
});
const testReport = (over: Partial<ApiTestReportBody> = {}): ApiTestReportBody => ({
  scenarios: [], unit_tests: [], unit_tests_note: '', ...over,
});

describe('new items', () => {
  it('each carry a UUID of their own and nothing typed', () => {
    const items = [newAction(), newKnownProblem(), newFollowUp(), newScenario(), newUnitTest()];
    for (const item of items) expect(item.id).toMatch(UUID);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(newAction()).toMatchObject({ action: '', reason: '' });
    expect(newKnownProblem('omission')).toMatchObject({ kind: 'omission', text: '' });
    expect(newScenario()).toMatchObject({ title: '', story_ids: [], steps_md: '', result: null, note: '' });
    expect(newUnitTest()).toMatchObject({ location: '', note: '', failing: false });
  });
});

describe('numberedSteps and scenarioFor', () => {
  it('numbers the criteria, whitespace collapsed', () => {
    expect(numberedSteps(['Sign in  with\nGoogle', 'See the trails'])).toBe('1. Sign in with Google\n2. See the trails');
    expect(numberedSteps([])).toBe('');
  });

  it('keeps only the whole criteria that fit the steps', () => {
    const steps = numberedSteps(Array.from({ length: 20 }, () => 'x'.repeat(290)));
    expect(steps.length).toBeLessThanOrEqual(2000);
    expect(steps.split('\n')).toHaveLength(6);
  });

  it('makes a scenario for a story as the seed does', () => {
    const scenario = scenarioFor({ id: 's1', key: 'US-1', title: 'Trail search', acceptance_criteria: ['Finds by name'] });
    expect(scenario).toMatchObject({ title: 'Trail search', story_ids: ['s1'], steps_md: '1. Finds by name', result: null });
    expect(scenario.id).toMatch(UUID);
    expect(scenarioFor({ id: 's2', key: 'US-2', title: '  ', acceptance_criteria: [] }).title).toBe('US-2');
    expect(scenarioFor({ id: 's3', key: 'US-3', title: 'y'.repeat(130), acceptance_criteria: [] }).title).toHaveLength(120);
  });
});

describe('prepareBody: sprint report', () => {
  it('trims every text and drops the rows with nothing typed', () => {
    const { body, problems } = prepareBody('sprint_report', sprintReport({
      start: [{ id: 'a', action: '  Pair on reviews ', reason: ' faster ' }, { id: 'b', action: ' ', reason: '' }],
      satisfied_note: '  nothing  ',
    }));
    expect(problems).toEqual([]);
    expect(body).toEqual(sprintReport({ start: [{ id: 'a', action: 'Pair on reviews', reason: 'faster' }], satisfied_note: 'nothing' }));
  });

  it('names an action left blank beside a reason, and every text past its limit', () => {
    const { problems } = prepareBody('sprint_report', sprintReport({
      stop: [{ id: 'a', action: '', reason: 'because' }],
      keep: [{ id: 'b', action: 'k'.repeat(201), reason: 'r'.repeat(401) }],
      satisfied_note: 'n'.repeat(601),
    }));
    expect(problems).toEqual([
      'Stop doing 1 needs an action',
      'Keep doing 1: the action is over 200 characters',
      'Keep doing 1: the reason is over 400 characters',
      'Why there is nothing to stop doing is over 600 characters',
    ]);
  });

  it('measures a text once trimmed, as the API does', () => {
    const { problems } = prepareBody('sprint_report', sprintReport({ start: [{ id: 'a', action: ` ${'k'.repeat(200)} `, reason: '' }] }));
    expect(problems).toEqual([]);
  });

  it('holds each list to ten actions', () => {
    const start = Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, action: 'Do', reason: '' }));
    expect(prepareBody('sprint_report', sprintReport({ start })).problems).toEqual(['Start doing holds at most 10 actions']);
  });
});

describe('prepareBody: release summary', () => {
  it('names each key story once and drops problems and follow-ups with no text', () => {
    const { body, problems } = prepareBody('release_summary', releaseSummary({
      key_story_ids: ['s1', 's2', 's1'],
      known_problems: [{ id: 'p1', kind: 'bug', text: ' Crash on Safari ' }, { id: 'p2', kind: 'omission', text: '' }],
      follow_ups: [{ id: 'f1', text: ' ' }, { id: 'f2', text: 'Dark mode' }],
    }));
    expect(problems).toEqual([]);
    expect(body).toEqual({
      key_story_ids: ['s1', 's2'],
      known_problems: [{ id: 'p1', kind: 'bug', text: 'Crash on Safari' }],
      follow_ups: [{ id: 'f2', text: 'Dark mode' }],
    });
  });

  it('names a list or a text past its limit', () => {
    const { problems } = prepareBody('release_summary', releaseSummary({
      key_story_ids: Array.from({ length: 31 }, (_, i) => `s${i}`),
      known_problems: [{ id: 'p1', kind: 'shortcut', text: 'p'.repeat(401) }],
      follow_ups: [{ id: 'f1', text: 'f'.repeat(301) }],
    }));
    expect(problems).toEqual([
      'Key stories hold at most 30 stories',
      'Known problem 1 is over 400 characters',
      'Follow-up 1 is over 300 characters',
    ]);
  });
});

describe('prepareBody: test report', () => {
  it('drops a scenario or a unit-test row with nothing in it', () => {
    const { body, problems } = prepareBody('test_report', testReport({
      scenarios: [newScenario(), { ...newScenario(), id: 'sc1', title: ' Log in ', story_ids: ['s1', 's1'], steps_md: ' 1. Go \n', result: 'pass' }],
      unit_tests: [newUnitTest(), { id: 'u1', location: ' backend/tests ', note: '', failing: true }],
      unit_tests_note: ' run with pytest ',
    }));
    expect(problems).toEqual([]);
    expect(body).toEqual({
      scenarios: [{ id: 'sc1', title: 'Log in', story_ids: ['s1'], steps_md: '1. Go', result: 'pass', note: '' }],
      unit_tests: [{ id: 'u1', location: 'backend/tests', note: '', failing: true }],
      unit_tests_note: 'run with pytest',
    });
  });

  it('names a title or a location left blank, and every limit', () => {
    const { problems } = prepareBody('test_report', testReport({
      scenarios: [{ id: 'sc1', title: '', story_ids: ['a', 'b', 'c', 'd', 'e', 'f'], steps_md: 's'.repeat(2001), result: null, note: 'n'.repeat(301) }],
      unit_tests: [{ id: 'u1', location: '', note: 'n'.repeat(301), failing: false }],
      unit_tests_note: 'x'.repeat(601),
    }));
    expect(problems).toEqual([
      'Scenario 1 needs a title',
      'Scenario 1 covers at most 5 stories',
      'Scenario 1: the steps are over 2000 characters',
      'Scenario 1: the note is over 300 characters',
      'Unit tests 1 needs a location',
      'Unit tests 1: the note is over 300 characters',
      'The note on the unit tests is over 600 characters',
    ]);
  });

  it('refuses a body too long to store, with the API’s sentence', () => {
    // 60 scenarios of 2000 two-byte characters: within every field's limit, past 200,000 bytes.
    const scenarios = Array.from({ length: 60 }, (_, i) => ({ ...newScenario(), title: `S${i}`, steps_md: 'é'.repeat(2000) }));
    expect(prepareBody('test_report', testReport({ scenarios })).problems).toEqual([TOO_LONG]);
  });
});

describe('bodyChanged and bodiesEqual', () => {
  const saved = sprintReport({ start: [{ id: 'a', action: 'Pair', reason: '' }] });

  it('sees a real change', () => {
    expect(bodyChanged('sprint_report', sprintReport({ start: [{ id: 'a', action: 'Pair up', reason: '' }] }), saved)).toBe(true);
  });

  it('ignores whitespace and a row with nothing typed', () => {
    const working = sprintReport({ start: [{ id: 'a', action: 'Pair  ', reason: '' }], keep: [newAction()] });
    expect(bodyChanged('sprint_report', working, saved)).toBe(false);
  });

  it('compares bodies whatever the order of their keys', () => {
    expect(bodiesEqual({ a: 1, b: [{ c: 1, d: 2 }] }, { b: [{ d: 2, c: 1 }], a: 1 })).toBe(true);
    expect(bodiesEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

describe('storyIdsOf and withoutStories', () => {
  it('lists the stories a body names, each once', () => {
    expect(storyIdsOf('release_summary', releaseSummary({ key_story_ids: ['s1', 's2'] }))).toEqual(['s1', 's2']);
    const report = testReport({ scenarios: [newScenario({ story_ids: ['s1', 's2'] }), newScenario({ story_ids: ['s2', 's3'] })] });
    expect(storyIdsOf('test_report', report)).toEqual(['s1', 's2', 's3']);
    expect(storyIdsOf('sprint_report', sprintReport())).toEqual([]);
  });

  it('takes the deleted stories out of the key stories, saying so', () => {
    const { body, changed } = withoutStories('release_summary', releaseSummary({ key_story_ids: ['s1', 's2'] }), new Set(['s2']));
    expect(body.key_story_ids).toEqual(['s1']);
    expect(changed).toEqual(['Key stories']);
    expect(withoutStories('release_summary', body, new Set(['s9'])).changed).toEqual([]);
  });

  it("takes them out of each scenario that named one, naming the scenario", () => {
    const report = testReport({
      scenarios: [newScenario({ title: 'Log in', story_ids: ['s1', 's2'] }), newScenario({ story_ids: ['s1'] }), newScenario({ story_ids: ['s3'] })],
    });
    const { body, changed } = withoutStories('test_report', report, new Set(['s1']));
    expect(body.scenarios.map((s) => s.story_ids)).toEqual([['s2'], [], ['s3']]);
    expect(changed).toEqual(['Scenario 1 (“Log in”)', 'Scenario 2']);
  });
});
