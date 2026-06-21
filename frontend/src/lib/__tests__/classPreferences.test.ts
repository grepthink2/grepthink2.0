import { beforeEach } from 'vitest';
import {
  loadClassPreferences,
  patchClassPreference,
  saveClassPreferences,
} from '../classPreferences';

describe('classPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty map when nothing is stored', () => {
    expect(loadClassPreferences()).toEqual({});
  });

  it('returns an empty map when stored JSON is corrupt', () => {
    localStorage.setItem('grepthink-class-preferences', '{not json');
    expect(loadClassPreferences()).toEqual({});
  });

  it('round-trips a saved preference map', () => {
    saveClassPreferences({ 'class-1': { hidden: true } });
    expect(loadClassPreferences()).toEqual({ 'class-1': { hidden: true } });
  });

  it('patch hiding a class persists it', () => {
    const next = patchClassPreference('class-1', { hidden: true });
    expect(next['class-1']).toEqual({ hidden: true });
    expect(loadClassPreferences()['class-1']).toEqual({ hidden: true });
  });

  it('patch un-hiding a class removes the entry entirely', () => {
    patchClassPreference('class-1', { hidden: true });
    const next = patchClassPreference('class-1', { hidden: false });
    expect(next['class-1']).toBeUndefined();
    expect(loadClassPreferences()).toEqual({});
  });
});
