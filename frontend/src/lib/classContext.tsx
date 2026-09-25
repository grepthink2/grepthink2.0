import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { api, type ApiInstitutionSummary, type ClassRole } from './api';
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
} from './classMembership';

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

export type { ClassRole };
export type School = ApiInstitutionSummary;

export interface Class {
  id: string;
  name: string;
  description?: string;
  course_code?: string;
  created_by: string;
  created_at: string;
  teacher_email?: string;
  /** Present for instructor-owned classes from API (used for course lifecycle filters). */
  term?: string;
  start_date?: string;
  year?: number;
  image_url?: string;
  /** Lifecycle status from classes.status — active or complete. */
  status?: ClassLifecycleStatus;
  /** My Classes: number of students in class_enrollments. */
  enrolled_count?: number;
  /** The signed-in user's role in this class. */
  my_role: ClassRole;
  /** The school the class belongs to, when known. */
  institution: School | null;
  institution_id?: string | null;
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
  setSelectedClass: (classItem: Class | null) => void;
  // Accept showLoading param to avoid blocking UI when refreshing after join.
  // Pass selectClassId to force the sidebar selection (e.g. after creating a class).
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

  const visibleClasses = useMemo(
    () => filterVisibleClasses(classes, preferences),
    [classes, preferences],
  );

  const activeClasses = useMemo(
    () => filterActiveClasses(classes, preferences),
    [classes, preferences],
  );

  const setSelectedClass = useCallback((classItem: Class | null) => {
    setSelectedClassState(classItem);
    persistSelectedClassId(classItem?.id ?? null);
  }, []);

  const reselectSidebarClass = useCallback(
    (preferredId: string | null) => {
      const resolved = resolveSelectedClass(activeClasses, preferredId);
      setSelectedClass(resolved);
    },
    [activeClasses, setSelectedClass],
  );

  // Read by a load when it lands; the effects below keep them current.
  const classesRef = useRef<Class[]>([]);
  const lastSelectedClassId = useRef<string | undefined>(undefined);

  // Fetches the roster and re-resolves the selection. Loads overlap (a focus refresh, My Classes'
  // timer, a join or create), so only the newest request's answer is applied, and a status change
  // retires the loads in flight. A class that a dropped load was asked to select carries over.
  const loadSeq = useRef(0);
  const requestedClassId = useRef<string | null | undefined>(undefined);
  const lastLoadStartedAt = useRef(0);
  const loadClasses = useCallback(
    (selectClassId?: string | null) => {
      const seq = ++loadSeq.current;
      lastLoadStartedAt.current = Date.now();
      if (selectClassId !== undefined) requestedClassId.current = selectClassId;
      return api
        .getClasses()
        .then((response) => {
          if (seq !== loadSeq.current) return;
          const requested = requestedClassId.current;
          const all = reuseUnchangedClasses(
            classesRef.current,
            response.classes.map((c) => toClass(c, userId)),
          );
          setClasses(all);

          const prefs = getPreferencesSnapshot();
          const visible = filterVisibleClasses(all, prefs);
          const active = filterActiveClasses(all, prefs);
          // Unless a class was asked for, keep this tab's class: storage is shared by every tab, so
          // it only seeds the first load.
          const preferredId =
            requested !== undefined
              ? requested
              : (lastSelectedClassId.current ?? getStoredSelectedClassId());
          // Keep focus on completed classes chosen from My Classes; fall back to an active class.
          const resolved =
            resolveSelectedClass(visible, preferredId) ?? resolveSelectedClass(active, null);
          setSelectedClass(resolved);
        })
        .catch((error: unknown) => {
          console.error('Failed to fetch classes:', error);
        })
        .finally(() => {
          if (seq !== loadSeq.current) return;
          requestedClassId.current = undefined;
          setLoading(false);
        });
    },
    [setSelectedClass, userId],
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
    // A load already in flight may answer the old status; it must not undo this change.
    loadSeq.current += 1;
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

  // What the next load compares against, so rows that did not change keep their objects.
  useEffect(() => {
    classesRef.current = classes;
  }, [classes]);

  // Keep storage on the selected class, including a fallback picked above.
  useEffect(() => {
    if (selectedClassId) persistSelectedClassId(selectedClassId);
  }, [selectedClassId]);

  // Remember the class last used at each school, for the school switcher.
  const selectedSchoolId = selectedClass?.institution?.id;
  useEffect(() => {
    if (selectedClassId && selectedSchoolId) rememberClassForSchool(selectedSchoolId, selectedClassId);
  }, [selectedClassId, selectedSchoolId]);

  // Track this tab's class for the next load, and end "view class as student" when another class
  // is picked. The first selection (classes arriving) is not a switch.
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
