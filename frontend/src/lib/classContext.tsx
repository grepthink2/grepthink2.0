import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { api, type ClassRole } from './api';
import { useAuth } from './auth';
import { usePreview } from './previewContext';
import {
  loadClassPreferences,
  patchClassPreference,
  type ClassLifecycleStatus,
  type ClassPreferenceMap,
} from './classPreferences';
import { getClassDisplayStatus, isClassHidden } from './classLifecycle';
import {
  classesForSchool,
  distinctSchools,
  loadLastClassBySchool,
  rememberClassForSchool,
  reuseUnchangedClasses,
  roleInView,
  toClass,
  type Class,
  type School,
} from './classMembership';

export type { Class, ClassRole, School };

function getPreferencesSnapshot(): ClassPreferenceMap {
  return loadClassPreferences();
}

const SELECTED_CLASS_STORAGE_KEY = 'grepthink-selected-class-id';

function getStoredSelectedClassId(): string | null {
  try {
    return localStorage.getItem(SELECTED_CLASS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSelectedClassId(classId: string | null): void {
  try {
    if (classId) {
      localStorage.setItem(SELECTED_CLASS_STORAGE_KEY, classId);
    } else {
      localStorage.removeItem(SELECTED_CLASS_STORAGE_KEY);
    }
  } catch {
    // Storage full or unavailable — silently ignore.
  }
}

/** Re-read the class list when the tab regains focus, at most this often. */
const REFRESH_ON_FOCUS_MS = 30_000;

function resolveSelectedClass(classes: Class[], preferredId: string | null): Class | null {
  if (preferredId) {
    const match = classes.find((c) => c.id === preferredId);
    if (match) return match;
  }
  return classes.length > 0 ? classes[0] : null;
}

/** Resolves once the newest load has settled, following any load started while it waits. */
async function untilSettled(newestLoad: { current: Promise<void> }): Promise<void> {
  let load: Promise<void>;
  do {
    load = newestLoad.current;
    await load;
  } while (load !== newestLoad.current);
}

interface ClassContextValue {
  classes: Class[];
  /** Classes visible in My Classes (excludes user-hidden). */
  visibleClasses: Class[];
  /**
   * The class switcher's list: the current school's active classes plus the classes with no
   * school. Every active class when they share one school, when no school is current, or when the
   * current school has no active class.
   */
  sidebarClasses: Class[];
  /** Schools the switcher offers, by name: those with active classes, plus the current one. */
  schools: School[];
  /** The selected class's school. */
  currentSchool: School | null;
  /** Active classes span two or more schools: show the school switcher and caption. */
  showSchoolSwitcher: boolean;
  /** Select the last class used at `schoolId` (else its first active class) and return it. */
  selectSchool: (schoolId: string) => Class | null;
  /** The class "view class as student" previews (the one selected when it began); else null. */
  previewClassId: string | null;
  selectedClass: Class | null;
  /** The user picks a class; it wins over a class that a load in flight was asked to select. */
  setSelectedClass: (classItem: Class | null) => void;
  // Accept showLoading param to avoid blocking UI when refreshing after join.
  // Pass selectClassId to force the sidebar selection (e.g. after creating a class).
  // Resolves once the newest load has settled, so that class is selected by then.
  refreshClasses: (showLoading?: boolean, selectClassId?: string | null) => Promise<void>;
  loading: boolean;
  // Success message state for cross-component notifications (e.g., after joining class)
  successMessage: string | null;
  setSuccessMessage: (message: string | null) => void;
  getClassStatus: (classItem: Class) => ClassLifecycleStatus;
  setClassLifecycleStatus: (classId: string, status: ClassLifecycleStatus) => Promise<void>;
  hideClassFromUI: (classId: string) => void;
}

const ClassContext = createContext<ClassContextValue | undefined>(undefined);

function filterVisibleClasses(all: Class[], preferences: ClassPreferenceMap): Class[] {
  return all.filter((c) => !isClassHidden(c.id, preferences));
}

function filterActiveClasses(all: Class[], preferences: ClassPreferenceMap): Class[] {
  return filterVisibleClasses(all, preferences).filter(
    (c) => getClassDisplayStatus(c) === 'active',
  );
}

export const ClassProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const { isPreviewing, exitPreview } = usePreview();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClassState] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<ClassPreferenceMap>(() => loadClassPreferences());
  const [previewClassId, setPreviewClassId] = useState<string | null>(null);

  // Loads overlap (a focus refresh, My Classes' timer, a join or create), numbered as they start.
  // An answer is applied unless a later-started load's answer already was, or a status change
  // retired it; so an older success still lands when a newer load fails. A class a load was asked
  // to select waits until a load started since applies it or the user picks a class, and is
  // dropped once no load in flight could still apply it (they failed or were retired), so a
  // refresh minutes later never jumps to it.
  const loadSeq = useRef(0);
  const appliedSeq = useRef(0);
  const loadsInFlight = useRef(new Set<number>());
  const requestedClass = useRef<{ id: string | null; seq: number } | null>(null);
  const newestLoad = useRef<Promise<void>>(Promise.resolve());
  const lastLoadStartedAt = useRef(0);
  // The list and this tab's class as a landing load sees them. Written as the provider applies an
  // answer or selects a class, so an answer landing right behind another reads the newer state;
  // the effects below also sync them after a status change or a fallback picked while rendering.
  const classesRef = useRef<Class[]>([]);
  const tabClassId = useRef<string | undefined>(undefined);
  // The class the effect below last synced `tabClassId` to: a different `tabClassId` was written
  // by a selection since, which an older commit's effect must not overwrite.
  const syncedTabClassId = useRef<string | undefined>(undefined);
  // The class selected at the last commit, to end "view class as student" on a class switch.
  const lastSelectedClassId = useRef<string | undefined>(undefined);

  const visibleClasses = useMemo(
    () => filterVisibleClasses(classes, preferences),
    [classes, preferences],
  );

  const activeClasses = useMemo(
    () => filterActiveClasses(classes, preferences),
    [classes, preferences],
  );

  // Select a class and save it for the next visit.
  const selectClass = useCallback((classItem: Class | null) => {
    tabClassId.current = classItem?.id;
    setSelectedClassState(classItem);
    persistSelectedClassId(classItem?.id ?? null);
  }, []);

  const setSelectedClass = useCallback(
    (classItem: Class | null) => {
      requestedClass.current = null;
      selectClass(classItem);
    },
    [selectClass],
  );

  const reselectSidebarClass = useCallback(
    (preferredId: string | null) => {
      const resolved = resolveSelectedClass(activeClasses, preferredId);
      setSelectedClass(resolved);
    },
    [activeClasses, setSelectedClass],
  );

  // Fetches the roster and re-resolves the selection; resolves once the newest load has settled.
  const loadClasses = useCallback(
    (selectClassId?: string | null): Promise<void> => {
      const seq = ++loadSeq.current;
      loadsInFlight.current.add(seq);
      lastLoadStartedAt.current = Date.now();
      if (selectClassId !== undefined) requestedClass.current = { id: selectClassId, seq };
      let failed = false;
      const load = api
        .getClasses()
        .then((response) => {
          if (seq <= appliedSeq.current) return;
          appliedSeq.current = seq;
          const all = reuseUnchangedClasses(
            classesRef.current,
            response.classes.map((c) => toClass(c, userId)),
          );
          classesRef.current = all;
          setClasses(all);

          // A load that started before the request may not know the class yet.
          const request = requestedClass.current;
          const honorsRequest = request !== null && seq >= request.seq;
          if (honorsRequest) requestedClass.current = null;
          const prefs = getPreferencesSnapshot();
          const visible = filterVisibleClasses(all, prefs);
          const active = filterActiveClasses(all, prefs);
          // Unless a class was asked for, keep this tab's class: storage is shared by every tab, so
          // it only seeds the first load.
          const preferredId = honorsRequest
            ? request.id
            : (tabClassId.current ?? getStoredSelectedClassId());
          // Keep focus on completed classes chosen from My Classes; fall back to an active class.
          const resolved =
            resolveSelectedClass(visible, preferredId) ?? resolveSelectedClass(active, null);
          selectClass(resolved);
        })
        .catch((error: unknown) => {
          failed = true;
          console.error('Failed to fetch classes:', error);
        })
        .finally(() => {
          // Only a load started since the request can apply it; with none left in flight, the
          // class is dropped rather than jumped to by a later refresh.
          loadsInFlight.current.delete(seq);
          const request = requestedClass.current;
          if (request && ![...loadsInFlight.current].some((s) => s >= request.seq)) {
            requestedClass.current = null;
          }
          // The newest load settles the spinner. After a failure the next focus retries at once.
          if (seq !== loadSeq.current) return;
          if (failed) lastLoadStartedAt.current = 0;
          setLoading(false);
        });
      newestLoad.current = load;
      return untilSettled(newestLoad);
    },
    [selectClass, userId],
  );

  const refreshClasses = useCallback(
    async (showLoading = true, selectClassId?: string | null) => {
      if (showLoading) setLoading(true);
      await loadClasses(selectClassId);
    },
    [loadClasses],
  );

  const getClassStatus = useCallback(
    (classItem: Class) => getClassDisplayStatus(classItem),
    [],
  );

  const setClassLifecycleStatus = useCallback(async (classId: string, status: ClassLifecycleStatus) => {
    const { class: updated } = await api.updateClassStatus(classId, status);
    // Retire the loads in flight: one may answer the old status and undo this change.
    appliedSeq.current = loadSeq.current;
    setClasses((prev) => prev.map((c) => (c.id === classId ? { ...c, ...updated } : c)));
    setSelectedClassState((prev) => (prev?.id === classId ? { ...prev, ...updated } : prev));
  }, []);

  const hideClassFromUI = useCallback(
    (classId: string) => {
      const next = patchClassPreference(classId, { hidden: true });
      setPreferences(next);
      if (selectedClass?.id === classId) {
        reselectSidebarClass(getStoredSelectedClassId());
      }
    },
    [selectedClass?.id, reselectSidebarClass],
  );

  const activeSchools = useMemo(() => distinctSchools(activeClasses), [activeClasses]);
  const showSchoolSwitcher = activeSchools.length > 1;
  const currentSchool = selectedClass?.institution ?? null;
  const schools = useMemo(
    () => (selectedClass ? distinctSchools([...activeClasses, selectedClass]) : activeSchools),
    [activeClasses, activeSchools, selectedClass],
  );
  const sidebarClasses = useMemo(
    () =>
      showSchoolSwitcher && currentSchool
        ? classesForSchool(activeClasses, currentSchool.id)
        : activeClasses,
    [showSchoolSwitcher, currentSchool, activeClasses],
  );

  const selectSchool = useCallback(
    (schoolId: string): Class | null => {
      const active = activeClasses.filter((c) => c.institution?.id === schoolId);
      const pool = active.length > 0 ? active : visibleClasses.filter((c) => c.institution?.id === schoolId);
      const remembered = loadLastClassBySchool()[schoolId];
      const target = pool.find((c) => c.id === remembered) ?? pool[0] ?? null;
      if (target) setSelectedClass(target);
      return target;
    },
    [activeClasses, visibleClasses, setSelectedClass],
  );

  // Clear focus only when the class is hidden or no longer in the roster (not
  // when completed), falling back to the first active class. Adjusted while
  // rendering; the effect below saves the fallback.
  if (selectedClass && !visibleClasses.some((c) => c.id === selectedClass.id)) {
    setSelectedClassState(resolveSelectedClass(activeClasses, null));
  }

  const selectedClassId = selectedClass?.id;

  // "View class as student" belongs to the class selected when it began, so after a class switch
  // the next class never shows as a student's while the effect below ends the preview. Adjusted
  // while rendering.
  if (isPreviewing && previewClassId === null && selectedClassId !== undefined) {
    setPreviewClassId(selectedClassId);
  } else if (!isPreviewing && previewClassId !== null) {
    setPreviewClassId(null);
  }

  // The first load; `loading` already starts out true.
  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  // What the next load compares against (a status change edits the list), so rows that did not
  // change keep their objects.
  useEffect(() => {
    classesRef.current = classes;
  }, [classes]);

  // Keep this tab's class and storage on the selected class, including a fallback picked above.
  // An answer can land between a commit and its effects and select a newer class; this older
  // commit's effect then leaves that selection alone.
  useEffect(() => {
    if (tabClassId.current === syncedTabClassId.current) tabClassId.current = selectedClassId;
    syncedTabClassId.current = selectedClassId;
    if (selectedClassId) persistSelectedClassId(selectedClassId);
  }, [selectedClassId]);

  // Remember the class last used at each school, for the school switcher.
  const selectedSchoolId = selectedClass?.institution?.id;
  useEffect(() => {
    if (selectedClassId && selectedSchoolId) rememberClassForSchool(selectedSchoolId, selectedClassId);
  }, [selectedClassId, selectedSchoolId]);

  // End "view class as student" when another class is picked. The first selection (classes
  // arriving) is not a switch.
  useEffect(() => {
    const previous = lastSelectedClassId.current;
    if (previous === selectedClassId) return;
    lastSelectedClassId.current = selectedClassId;
    if (previous !== undefined && isPreviewing) exitPreview();
  }, [selectedClassId, isPreviewing, exitPreview]);

  // A TA promoted or a class joined elsewhere shows up when the tab regains focus. Every load
  // stamps its start, so the two events of one focus send one request, and a load that just went
  // out (My Classes refreshes on its own) is not repeated.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadStartedAt.current < REFRESH_ON_FOCUS_MS) return;
      void loadClasses();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadClasses]);

  const value = useMemo(
    () => ({
      classes,
      visibleClasses,
      sidebarClasses,
      schools,
      currentSchool,
      showSchoolSwitcher,
      selectSchool,
      previewClassId,
      selectedClass,
      setSelectedClass,
      refreshClasses,
      loading,
      successMessage,
      setSuccessMessage,
      getClassStatus,
      setClassLifecycleStatus,
      hideClassFromUI,
    }),
    [
      classes,
      visibleClasses,
      sidebarClasses,
      schools,
      currentSchool,
      showSchoolSwitcher,
      selectSchool,
      previewClassId,
      selectedClass,
      setSelectedClass,
      refreshClasses,
      loading,
      successMessage,
      getClassStatus,
      setClassLifecycleStatus,
      hideClassFromUI,
    ],
  );

  return <ClassContext.Provider value={value}>{children}</ClassContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useClass = () => {
  const context = useContext(ClassContext);
  if (!context) {
    throw new Error('useClass must be used within ClassProvider');
  }
  return context;
};

/** Your role in the selected class: undefined while classes load, null with no class. */
// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useSelectedClassRole = (): ClassRole | null | undefined => {
  const { selectedClass, loading, previewClassId } = useClass();
  if (!selectedClass) return loading ? undefined : null;
  return roleInView(selectedClass, previewClassId);
};

/** Your role in `classId`: undefined while classes load, null when you are not in it (or no id). */
// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useClassRole = (classId: string | null | undefined): ClassRole | null | undefined => {
  const { classes, loading, previewClassId } = useClass();
  if (!classId) return null;
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return loading ? undefined : null;
  return roleInView(cls, previewClassId);
};
