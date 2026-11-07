import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMoveInInviteSettled, settleMoveInInvite } from '../moveInInviteStore';

/** The store also remembers for the page's life, so each test takes its own project. */
let projects = 0;
const newProject = () => `p${++projects}`;

const blockStorage = (method: 'getItem' | 'setItem') =>
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error('blocked');
  });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('moveInInviteStore', () => {
  it('settles a team for this visit, and only that team', () => {
    const [project, other] = [newProject(), newProject()];

    settleMoveInInvite(project);

    expect(sessionStorage.getItem(`gt.scrum.moveInInviteSettled.${project}`)).not.toBeNull();
    expect(localStorage.length).toBe(0);
    expect(isMoveInInviteSettled(project)).toBe(true);
    expect(isMoveInInviteSettled(other)).toBe(false);
  });

  it('reads what this visit already holds', () => {
    const project = newProject();
    sessionStorage.setItem(`gt.scrum.moveInInviteSettled.${project}`, '1');

    expect(isMoveInInviteSettled(project)).toBe(true);
  });

  it('holds for the page when storage refuses the write', () => {
    const project = newProject();
    blockStorage('setItem');

    settleMoveInInvite(project);

    expect(isMoveInInviteSettled(project)).toBe(true);
  });

  it('reads as not settled when storage cannot be read', () => {
    const project = newProject();
    blockStorage('getItem');

    expect(isMoveInInviteSettled(project)).toBe(false);
  });
});
