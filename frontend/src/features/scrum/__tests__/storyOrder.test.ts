import { describe, expect, it } from 'vitest';
import { compareStories, sortStories } from '../utils/storyOrder';
import { makeStory } from './fixtures';

const keys = (stories: { key: string }[]) => stories.map((s) => s.key);

describe('sortStories (the backend’s _story_order)', () => {
  it('puts ranked stories first, by rank, then the rest by the number in their key', () => {
    const stories = [
      makeStory({ id: 'a', key: 'US-10' }),
      makeStory({ id: 'b', key: 'US-2', rank: 2 }),
      makeStory({ id: 'c', key: 'US-1' }),
      makeStory({ id: 'd', key: 'US-9' }),
      makeStory({ id: 'e', key: 'US-3', rank: 1 }),
    ];
    expect(keys(sortStories(stories))).toEqual(['US-3', 'US-2', 'US-1', 'US-9', 'US-10']);
  });

  it('breaks a tie in rank by key, and sorts a key that ends in no number after the rest, as text', () => {
    const stories = [
      makeStory({ key: 'US-b' }),
      makeStory({ key: 'US-12', rank: 1 }),
      makeStory({ key: 'US-a' }),
      makeStory({ key: 'US-4', rank: 1 }),
      makeStory({ key: 'US-7' }),
    ];
    expect(keys(sortStories(stories))).toEqual(['US-4', 'US-12', 'US-7', 'US-a', 'US-b']);
  });

  it('reads a story with no rank field (an older backend) as unranked', () => {
    const { rank: _omitted, ...older } = makeStory({ key: 'US-1' });
    expect(keys(sortStories([older, makeStory({ key: 'US-5', rank: 1 })]))).toEqual(['US-5', 'US-1']);
  });

  it('leaves the list it was given as it was', () => {
    const stories = [makeStory({ key: 'US-2' }), makeStory({ key: 'US-1' })];
    const sorted = sortStories(stories);
    expect(keys(stories)).toEqual(['US-2', 'US-1']);
    expect(sorted).not.toBe(stories);
  });
});

describe('compareStories', () => {
  it('says which of two stories comes first', () => {
    const ranked = makeStory({ key: 'US-9', rank: 3 });
    const unranked = makeStory({ key: 'US-1' });
    expect(compareStories(ranked, unranked)).toBeLessThan(0);
    expect(compareStories(unranked, ranked)).toBeGreaterThan(0);
    expect(compareStories(unranked, makeStory({ key: 'US-1' }))).toBe(0);
  });
});
