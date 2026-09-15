import { describe, expect, it } from 'vitest';
import { emptyFeedbackFields, isTeamFeedbackComplete } from '../teamFeedbackValidation';
import type { FeedbackEntry, TeamMember } from '../tsrsTypes';

const member = (id: string) => ({ id, name: id, role: 'member' }) as TeamMember;
const answers = (contribution: string, improvement: string) =>
  ({ contribution, improvement }) as FeedbackEntry;

describe('team feedback validation', () => {
  const members = [member('a'), member('b')];

  it('is complete when every member has both answers', () => {
    const feedback = { a: answers('Led demos', 'Test earlier'), b: answers('Built API', 'Docs') };
    expect(isTeamFeedbackComplete(members, feedback)).toBe(true);
    expect(emptyFeedbackFields(members, feedback)).toEqual([]);
  });

  it('lists blank, whitespace-only and missing answers in member order', () => {
    const feedback = { a: answers('Led demos', '   ') };
    expect(isTeamFeedbackComplete(members, feedback)).toBe(false);
    expect(emptyFeedbackFields(members, feedback)).toEqual([
      'a-improvement',
      'b-contribution',
      'b-improvement',
    ]);
  });

  it('treats a team with no other members as complete', () => {
    expect(isTeamFeedbackComplete([], {})).toBe(true);
  });
});
