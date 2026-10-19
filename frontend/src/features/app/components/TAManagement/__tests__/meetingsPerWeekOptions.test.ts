import { describe, expect, it } from 'vitest';
import { meetingsPerWeekOptions } from '../taTypes';

describe('meetingsPerWeekOptions', () => {
  it('are 1 and 2, keeping a larger saved value', () => {
    expect(meetingsPerWeekOptions(1)).toEqual([1, 2]);
    expect(meetingsPerWeekOptions(2)).toEqual([1, 2]);
    expect(meetingsPerWeekOptions(4)).toEqual([1, 2, 4]);
  });

  it('keep every value up to the API limit of 7, so the select never has no option for the saved one', () => {
    for (let saved = 3; saved <= 7; saved++) {
      expect(meetingsPerWeekOptions(saved)).toEqual([1, 2, saved]);
    }
  });
});
