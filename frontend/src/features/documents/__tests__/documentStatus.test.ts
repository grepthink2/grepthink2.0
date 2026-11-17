import { describe, expect, it } from 'vitest';
import { BADGE_STATUS } from '@components/Badge/badgeStatus';
import { documentState, isHandedIn, SOURCE_BADGE, STATE_BADGE } from '../utils/documentStatus';

describe('documentState', () => {
  it('is not started for a place the team has not made a document for', () => {
    expect(documentState(null)).toBe('not_started');
    expect(documentState(undefined)).toBe('not_started');
  });

  it('is a draft, final, or final and edited since', () => {
    expect(documentState({ status: 'draft', edited_since: false })).toBe('draft');
    expect(documentState({ status: 'final', edited_since: false })).toBe('final');
    expect(documentState({ status: 'final', edited_since: true })).toBe('edited_since');
  });

  it('names each state with its badge, never a colour', () => {
    expect(Object.values(STATE_BADGE).map((status) => BADGE_STATUS[status][1])).toEqual([
      'Not started', 'Draft', 'Final', 'Final · edited since',
    ]);
    expect(BADGE_STATUS[SOURCE_BADGE.seed][1]).toBe('Started');
    expect(BADGE_STATUS[SOURCE_BADGE.edit][1]).toBe('Edited');
  });

  it('counts a final document as handed in, edited since or not', () => {
    expect(isHandedIn({ status: 'final', edited_since: true })).toBe(true);
    expect(isHandedIn({ status: 'draft', edited_since: false })).toBe(false);
    expect(isHandedIn(null)).toBe(false);
  });
});
