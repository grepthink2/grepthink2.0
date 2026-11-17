import type { ApiDocumentStory, ApiProjectDocument, ApiReleaseSummaryDerived, ApiTestReportDerived } from '@/lib/api';
import type { StoryFacts } from './checks';

/** A board story a body names, as the page can tell it. */
export type StoryRef =
  | { id: string; state: 'known'; key: string; title: string; acceptance_criteria: string[]; completed: boolean | null }
  /** Deleted from the board: "A story that was deleted". */
  | { id: string; state: 'missing' }
  /** Named by an edit and not read from the board yet. */
  | { id: string; state: 'unknown' };

/** The words for a story that was deleted from the board. */
export const STORY_GONE = 'A story that was deleted';

/**
 * How the page tells the stories a body names: the revision's derived sections first (what the API
 * read, or froze at hand-in), then the board's stories this page read (a story an edit just added).
 */
export function storyLookup(
  doc: ApiProjectDocument,
  board: ReadonlyMap<string, ApiDocumentStory>,
): (id: string) => StoryRef {
  const fromDerived = new Map<string, StoryRef>();
  if (doc.document.kind === 'release_summary') {
    for (const story of (doc.derived as ApiReleaseSummaryDerived).key_stories) {
      fromDerived.set(story.id, story.missing
        ? { id: story.id, state: 'missing' }
        : { id: story.id, state: 'known', key: story.key, title: story.title, acceptance_criteria: story.acceptance_criteria, completed: story.completed });
    }
  } else if (doc.document.kind === 'test_report') {
    for (const [id, story] of Object.entries((doc.derived as ApiTestReportDerived).stories)) {
      fromDerived.set(id, story.missing
        ? { id, state: 'missing' }
        : { id, state: 'known', key: story.key, title: story.title, acceptance_criteria: story.acceptance_criteria, completed: board.get(id)?.completed ?? null });
    }
  }
  return (id) => {
    const derived = fromDerived.get(id);
    if (derived) return derived;
    const story = board.get(id);
    if (story) {
      return { id, state: 'known', key: story.key, title: story.title, acceptance_criteria: story.acceptance_criteria, completed: story.completed };
    }
    return { id, state: 'unknown' };
  };
}

/** A story as the checks read it. */
export function storyFacts(ref: StoryRef): StoryFacts | 'missing' | undefined {
  if (ref.state === 'missing') return 'missing';
  if (ref.state === 'unknown') return undefined;
  return { key: ref.key, acceptance_criteria: ref.acceptance_criteria, completed: ref.completed };
}

/** "US-3 Trail search", or the words for a deleted story, or "A story" before the board is read. */
export function storyLabel(ref: StoryRef): string {
  if (ref.state === 'known') return `${ref.key} ${ref.title}`.trim();
  return ref.state === 'missing' ? STORY_GONE : 'A story';
}
