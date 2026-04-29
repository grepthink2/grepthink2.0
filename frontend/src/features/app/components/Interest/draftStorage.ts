import type { InterestFormState } from './interestTypes';

const KEY_PREFIX = 'interest-form-draft-';

const key = (assignmentId: string) => `${KEY_PREFIX}${assignmentId}`;

export function loadDraft(assignmentId: string): InterestFormState | null {
  try {
    const raw = localStorage.getItem(key(assignmentId));
    if (!raw) return null;
    return JSON.parse(raw) as InterestFormState;
  } catch {
    return null;
  }
}

export function saveDraft(assignmentId: string, state: InterestFormState) {
  try {
    localStorage.setItem(key(assignmentId), JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently ignore.
  }
}

export function clearDraft(assignmentId: string) {
  localStorage.removeItem(key(assignmentId));
}
