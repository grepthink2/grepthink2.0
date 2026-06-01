const STORAGE_KEY = 'grepthink-class-preferences';

export type ClassLifecycleStatus = 'active' | 'completed';

export interface ClassPreference {
  status?: ClassLifecycleStatus;
  hidden?: boolean;
}

export type ClassPreferenceMap = Record<string, ClassPreference>;

export function loadClassPreferences(): ClassPreferenceMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ClassPreferenceMap;
  } catch {
    return {};
  }
}

export function saveClassPreferences(preferences: ClassPreferenceMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage full or unavailable — silently ignore.
  }
}

export function patchClassPreference(
  classId: string,
  patch: Partial<ClassPreference>,
): ClassPreferenceMap {
  const next = { ...loadClassPreferences() };
  const current = next[classId] ?? {};
  const merged = { ...current, ...patch };

  if (!merged.status && !merged.hidden) {
    delete next[classId];
  } else {
    next[classId] = merged;
  }

  saveClassPreferences(next);
  return next;
}
