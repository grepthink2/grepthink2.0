import type {
  ApiDocumentBodies,
  ApiDocumentKind,
  ApiFollowUp,
  ApiKnownProblem,
  ApiReleaseSummaryBody,
  ApiSprintAction,
  ApiSprintReportBody,
  ApiTestReportBody,
  ApiTestScenario,
  ApiUnitTestEntry,
} from '@/lib/api';
import { ACTION_LISTS, PROBLEM_KIND_LABELS } from './documentBody';

/** A run of words that both texts share, or that only the newer (`ins`) or the older (`del`) has. */
export interface WordPart {
  op: 'same' | 'ins' | 'del';
  text: string;
}

/** How one field of an item changed. */
export type FieldChange =
  /** A text, word by word. */
  | { kind: 'text'; parts: WordPart[] }
  /** A value picked from a few (a problem's kind, a scenario's result), as the page names them. */
  | { kind: 'value'; from: string; to: string }
  /** The stories a scenario covers: the ids it gained and lost. */
  | { kind: 'stories'; added: string[]; removed: string[] };

/**
 * One difference between two revisions' bodies. Items are matched by id. `label` names the item as the
 * newer revision has it (the older one's for a removed item); when `story` is set the item is a board
 * story and `itemId` its id, which the page names. `from` and `to` are 1-based places in the list.
 * A change to a body's own text field (not a list's item) has no item: `itemId` and `label` are null.
 */
export type BodyChange =
  | { type: 'added' | 'removed'; section: string; itemId: string; label: string; story?: boolean }
  | { type: 'moved'; section: string; itemId: string; label: string; story?: boolean; from: number; to: number }
  | { type: 'changed'; section: string; itemId: string | null; label: string | null; field: string; change: FieldChange };

// ----- Longest common subsequence -----------------------------------------------------------------

/** Past this many cells a word diff gives up on words and replaces the whole text. */
const MAX_CELLS = 250_000;

/** `table[i * (m + 1) + j]`: the longest common subsequence of `a` from `i` and `b` from `j`. */
function lcsTable<T>(a: readonly T[], b: readonly T[]): Uint32Array {
  const n = a.length;
  const m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * (m + 1) + j] = a[i] === b[j]
        ? table[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1]);
    }
  }
  return table;
}

/** The elements of `b` that are not part of a longest common subsequence with `a`. */
function outOfOrder<T>(a: readonly T[], b: readonly T[]): Set<T> {
  const table = lcsTable(a, b);
  const m = b.length;
  const kept = new Set<T>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      kept.add(b[j]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return new Set(b.filter((x) => !kept.has(x)));
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/** Adds a word to the parts, joining it to the run before when that run has the same op. */
function push(parts: WordPart[], op: WordPart['op'], word: string) {
  const last = parts[parts.length - 1];
  if (last && last.op === op) last.text = `${last.text} ${word}`;
  else parts.push({ op, text: word });
}

/**
 * The words of `newer` against `older`, split on whitespace: runs both share (`same`), and runs only
 * the newer (`ins`) or the older (`del`) has, by a longest common subsequence of words. A pair of
 * texts too long to compare word by word is one deletion and one insertion.
 */
export function wordDiff(older: string, newer: string): WordPart[] {
  const a = words(older);
  const b = words(newer);
  const parts: WordPart[] = [];
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) {
    if (a.length) parts.push({ op: 'del', text: a.join(' ') });
    if (b.length) parts.push({ op: 'ins', text: b.join(' ') });
    return parts;
  }
  const table = lcsTable(a, b);
  const m = b.length;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(parts, 'same', a[i]);
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1])) {
      push(parts, 'del', a[i]);
      i += 1;
    } else {
      push(parts, 'ins', b[j]);
      j += 1;
    }
  }
  return parts;
}

// ----- What each kind's body holds ----------------------------------------------------------------

interface FieldSpec<T> {
  name: string;
  /** A text compared word by word, a value shown by its name, or a scenario's stories. */
  kind: FieldChange['kind'];
  read: (item: T) => string | string[];
}

/** One list of a body (`B`) and what its items (`T`) are made of. */
interface ListSpec<B, T> {
  section: string;
  items: (body: B) => T[];
  id: (item: T) => string;
  label: (item: T) => string;
  /** The items are board stories (their ids). */
  story?: boolean;
  fields: FieldSpec<T>[];
}

/** The changes between two bodies of one kind in one list or field: a kind's spec, typed once. */
type Differ = (older: unknown, newer: unknown) => BodyChange[];

const RESULT_NAMES = { pass: 'Pass', fail: 'Fail', none: 'Not run' } as const;

const actionLists: ListSpec<ApiSprintReportBody, ApiSprintAction>[] = ACTION_LISTS.map(({ key, label }) => ({
  section: label,
  items: (body) => body[key],
  id: (item) => item.id,
  label: (item) => item.action,
  fields: [
    { name: 'Action', kind: 'text', read: (item) => item.action },
    { name: 'Reason', kind: 'text', read: (item) => item.reason },
  ],
}));

const keyStories: ListSpec<ApiReleaseSummaryBody, string> = {
  section: 'Key stories',
  items: (body) => body.key_story_ids,
  id: (id) => id,
  label: (id) => id,
  story: true,
  fields: [],
};

const knownProblems: ListSpec<ApiReleaseSummaryBody, ApiKnownProblem> = {
  section: 'Known problems',
  items: (body) => body.known_problems,
  id: (item) => item.id,
  label: (item) => item.text,
  fields: [
    { name: 'Kind', kind: 'value', read: (item) => PROBLEM_KIND_LABELS[item.kind] ?? item.kind },
    { name: 'Text', kind: 'text', read: (item) => item.text },
  ],
};

const followUps: ListSpec<ApiReleaseSummaryBody, ApiFollowUp> = {
  section: 'Follow-ups',
  items: (body) => body.follow_ups,
  id: (item) => item.id,
  label: (item) => item.text,
  fields: [{ name: 'Text', kind: 'text', read: (item) => item.text }],
};

const scenarios: ListSpec<ApiTestReportBody, ApiTestScenario> = {
  section: 'Scenarios',
  items: (body) => body.scenarios,
  id: (item) => item.id,
  label: (item) => item.title,
  fields: [
    { name: 'Title', kind: 'text', read: (item) => item.title },
    { name: 'Stories', kind: 'stories', read: (item) => item.story_ids },
    { name: 'Steps', kind: 'text', read: (item) => item.steps_md },
    { name: 'Result', kind: 'value', read: (item) => RESULT_NAMES[item.result ?? 'none'] },
    { name: 'Note', kind: 'text', read: (item) => item.note },
  ],
};

const unitTests: ListSpec<ApiTestReportBody, ApiUnitTestEntry> = {
  section: 'Unit tests',
  items: (body) => body.unit_tests,
  id: (item) => item.id,
  label: (item) => item.location,
  fields: [
    { name: 'Location', kind: 'text', read: (item) => item.location },
    { name: 'Note', kind: 'text', read: (item) => item.note },
    { name: 'Failing', kind: 'value', read: (item) => (item.failing ? 'Some fail' : 'All pass') },
  ],
};

function fieldChange<T>(field: FieldSpec<T>, older: T, newer: T): FieldChange | null {
  const before = field.read(older);
  const after = field.read(newer);
  if (field.kind === 'stories') {
    const was = before as string[];
    const now = after as string[];
    const added = now.filter((id) => !was.includes(id));
    const removed = was.filter((id) => !now.includes(id));
    return added.length || removed.length ? { kind: 'stories', added, removed } : null;
  }
  if (before === after) return null;
  if (field.kind === 'value') return { kind: 'value', from: before as string, to: after as string };
  return { kind: 'text', parts: wordDiff(before as string, after as string) };
}

function diffList<B, T>(spec: ListSpec<B, T>, olderBody: B, newerBody: B): BodyChange[] {
  const before = spec.items(olderBody);
  const after = spec.items(newerBody);
  const oldIds = before.map(spec.id);
  const newIds = after.map(spec.id);
  const oldById = new Map(before.map((item) => [spec.id(item), item]));
  const newSet = new Set(newIds);
  const story = spec.story ? { story: true } : {};
  const changes: BodyChange[] = [];

  for (const item of before) {
    const id = spec.id(item);
    if (!newSet.has(id)) changes.push({ type: 'removed', section: spec.section, itemId: id, label: spec.label(item), ...story });
  }
  // Moved: the items both keep, minus the longest run that kept its order.
  const moved = outOfOrder(oldIds.filter((id) => newSet.has(id)), newIds.filter((id) => oldById.has(id)));
  after.forEach((item, index) => {
    const id = spec.id(item);
    const was = oldById.get(id);
    const label = spec.label(item);
    if (was === undefined) {
      changes.push({ type: 'added', section: spec.section, itemId: id, label, ...story });
      return;
    }
    if (moved.has(id)) {
      changes.push({ type: 'moved', section: spec.section, itemId: id, label, ...story, from: oldIds.indexOf(id) + 1, to: index + 1 });
    }
    for (const field of spec.fields) {
      const change = fieldChange(field, was, item);
      if (change) changes.push({ type: 'changed', section: spec.section, itemId: id, label, field: field.name, change });
    }
  });
  return changes;
}

const list = <B, T>(spec: ListSpec<B, T>): Differ => (older, newer) => diffList(spec, older as B, newer as B);

/** A body's own text field (not a list's item), compared word by word. */
const scalar = <B,>(section: string, field: string, read: (body: B) => string): Differ => (older, newer) => {
  const before = read(older as B);
  const after = read(newer as B);
  if (before === after) return [];
  return [{
    type: 'changed', section, itemId: null, label: null, field,
    change: { kind: 'text', parts: wordDiff(before, after) },
  }];
};

/** Each kind's lists and fields, in the template's order. */
const SPECS: Record<ApiDocumentKind, Differ[]> = {
  sprint_report: [
    list(actionLists[0]),
    scalar<ApiSprintReportBody>('Stop doing', 'Why there is nothing to stop doing', (body) => body.satisfied_note),
    list(actionLists[1]),
    list(actionLists[2]),
  ],
  release_summary: [list(keyStories), list(knownProblems), list(followUps)],
  test_report: [
    list(scenarios),
    list(unitTests),
    scalar<ApiTestReportBody>('Unit tests', 'Note on the unit tests', (body) => body.unit_tests_note),
  ],
};

/**
 * What changed from `older` to `newer`, two bodies of one kind, as a flat list in the template's
 * order: per list, the items removed, then the items as the newer body lists them (added, moved,
 * and each field that changed), and the body's own text fields.
 */
export function diffBodies<K extends ApiDocumentKind>(
  kind: K, older: ApiDocumentBodies[K], newer: ApiDocumentBodies[K],
): BodyChange[] {
  return SPECS[kind].flatMap((differ) => differ(older, newer));
}
