import { describe, expect, it } from 'vitest';
import type { ApiReleaseSummaryBody, ApiSprintReportBody, ApiTestReportBody, ApiTestScenario } from '@/lib/api';
import { diffBodies, wordDiff } from '../utils/diff';

const report = (over: Partial<ApiSprintReportBody> = {}): ApiSprintReportBody => ({
  stop: [], start: [], keep: [], satisfied_note: '', ...over,
});
const summary = (over: Partial<ApiReleaseSummaryBody> = {}): ApiReleaseSummaryBody => ({
  key_story_ids: [], known_problems: [], follow_ups: [], ...over,
});
const scenario = (over: Partial<ApiTestScenario> = {}): ApiTestScenario => ({
  id: 'sc1', title: 'Log in', story_ids: [], steps_md: '', result: null, note: '', ...over,
});
const tests = (over: Partial<ApiTestReportBody> = {}): ApiTestReportBody => ({
  scenarios: [], unit_tests: [], unit_tests_note: '', ...over,
});

describe('wordDiff', () => {
  it('keeps the shared words and marks the rest, by longest common subsequence', () => {
    expect(wordDiff('the quick brown fox', 'the slow brown fox jumps')).toEqual([
      { op: 'same', text: 'the' },
      { op: 'del', text: 'quick' },
      { op: 'ins', text: 'slow' },
      { op: 'same', text: 'brown fox' },
      { op: 'ins', text: 'jumps' },
    ]);
  });

  it('splits on any whitespace, so a line break alone changes nothing', () => {
    expect(wordDiff('one two', 'one\ntwo')).toEqual([{ op: 'same', text: 'one two' }]);
  });

  it('handles an empty side', () => {
    expect(wordDiff('', 'new text')).toEqual([{ op: 'ins', text: 'new text' }]);
    expect(wordDiff('old text', '  ')).toEqual([{ op: 'del', text: 'old text' }]);
    expect(wordDiff('', '')).toEqual([]);
  });

  it('replaces the whole text when it is too long to compare word by word', () => {
    const a = Array.from({ length: 600 }, (_, i) => `a${i}`).join(' ');
    const b = Array.from({ length: 600 }, (_, i) => `b${i}`).join(' ');
    expect(wordDiff(a, b)).toEqual([{ op: 'del', text: a }, { op: 'ins', text: b }]);
  });
});

describe('diffBodies: items matched by id', () => {
  it('finds an added and a removed action', () => {
    const older = report({ start: [{ id: 'a', action: 'Pair', reason: '' }] });
    const newer = report({ start: [{ id: 'b', action: 'Review daily', reason: '' }] });
    expect(diffBodies('sprint_report', older, newer)).toEqual([
      { type: 'removed', section: 'Start doing', itemId: 'a', label: 'Pair' },
      { type: 'added', section: 'Start doing', itemId: 'b', label: 'Review daily' },
    ]);
  });

  it('reports a change per field, word by word', () => {
    const older = report({ keep: [{ id: 'a', action: 'Daily standup', reason: 'keeps us in sync' }] });
    const newer = report({ keep: [{ id: 'a', action: 'Daily standup', reason: 'keeps the team in sync' }] });
    expect(diffBodies('sprint_report', older, newer)).toEqual([{
      type: 'changed', section: 'Keep doing', itemId: 'a', label: 'Daily standup', field: 'Reason',
      change: { kind: 'text', parts: [
        { op: 'same', text: 'keeps' }, { op: 'del', text: 'us' }, { op: 'ins', text: 'the team' }, { op: 'same', text: 'in sync' },
      ] },
    }]);
  });

  it('reports only the items that left their order as moved, from and to their places', () => {
    const older = summary({ key_story_ids: ['s1', 's2', 's3', 's4'] });
    const newer = summary({ key_story_ids: ['s1', 's3', 's4', 's2'] });
    expect(diffBodies('release_summary', older, newer)).toEqual([
      { type: 'moved', section: 'Key stories', itemId: 's2', label: 's2', story: true, from: 2, to: 4 },
    ]);
  });

  it('does not call the items after an insertion moved', () => {
    const older = summary({ key_story_ids: ['s1', 's2'] });
    const newer = summary({ key_story_ids: ['s0', 's1', 's2'] });
    expect(diffBodies('release_summary', older, newer)).toEqual([
      { type: 'added', section: 'Key stories', itemId: 's0', label: 's0', story: true },
    ]);
  });

  it("names a problem's kind and a scenario's result, and lists a scenario's stories gained and lost", () => {
    const older = summary({ known_problems: [{ id: 'p', kind: 'bug', text: 'Crash' }] });
    const newer = summary({ known_problems: [{ id: 'p', kind: 'shortcut', text: 'Crash' }] });
    expect(diffBodies('release_summary', older, newer)).toEqual([{
      type: 'changed', section: 'Known problems', itemId: 'p', label: 'Crash', field: 'Kind',
      change: { kind: 'value', from: 'Bug', to: 'Design shortcut' },
    }]);

    const before = tests({ scenarios: [scenario({ story_ids: ['s1', 's2'] })] });
    const after = tests({ scenarios: [scenario({ story_ids: ['s2', 's3'], result: 'pass' })] });
    expect(diffBodies('test_report', before, after)).toEqual([
      { type: 'changed', section: 'Scenarios', itemId: 'sc1', label: 'Log in', field: 'Stories', change: { kind: 'stories', added: ['s3'], removed: ['s1'] } },
      { type: 'changed', section: 'Scenarios', itemId: 'sc1', label: 'Log in', field: 'Result', change: { kind: 'value', from: 'Not run', to: 'Pass' } },
    ]);
  });

  it("compares a body's own text fields", () => {
    expect(diffBodies('sprint_report', report(), report({ satisfied_note: 'All went well' }))).toEqual([{
      type: 'changed', section: 'Stop doing', itemId: null, label: null, field: 'Why there is nothing to stop doing',
      change: { kind: 'text', parts: [{ op: 'ins', text: 'All went well' }] },
    }]);
    const unit = { id: 'u', location: 'tests/', note: '', failing: false };
    expect(diffBodies('test_report', tests({ unit_tests: [unit] }), tests({ unit_tests: [{ ...unit, failing: true }], unit_tests_note: 'CI' }))).toEqual([
      { type: 'changed', section: 'Unit tests', itemId: 'u', label: 'tests/', field: 'Failing', change: { kind: 'value', from: 'All pass', to: 'Some fail' } },
      { type: 'changed', section: 'Unit tests', itemId: null, label: null, field: 'Note on the unit tests', change: { kind: 'text', parts: [{ op: 'ins', text: 'CI' }] } },
    ]);
  });

  it('finds nothing between equal bodies', () => {
    const body = tests({ scenarios: [scenario()] });
    expect(diffBodies('test_report', body, structuredClone(body))).toEqual([]);
  });
});
