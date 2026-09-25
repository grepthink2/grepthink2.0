import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { api, type ApiClass, type ApiInstitutionSummary, type ClassRole } from './api';
import { useAuth } from './auth';
import { usePreview } from './previewContext';
import {
  loadClassPreferences,
  patchClassPreference,
  type ClassLifecycleStatus,
  type ClassPreferenceMap,
} from './classPreferences';
import { getClassDisplayStatus, isClassHidden } from './classLifecycle';

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

const LAST_CLASS_BY_SCHOOL_KEY = 'grepthink-last-class-by-school';

function loadLastClassBySchool(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LAST_CLASS_BY_SCHOOL_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function rememberClassForSchool(schoolId: string, classId: string): void {
  try {
    localStorage.setItem(
      LAST_CLASS_BY_SCHOOL_KEY,
      JSON.stringify({ ...loadLastClassBySchool(), [schoolId]: classId }),
    );
  } catch {
    // Storage full or unavailable — the switcher falls back to the school's first class.
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
  /** Active, visible classes at the current school (every active class when they all share one). */
  sidebarClasses: Class[];
  /** Schools the switcher offers: those with active classes, plus the current one. */
  schools: School[];
  /** The selected class's school. */
  currentSchool: School | null;
  /** Active classes span two or more schools: show the school switcher and caption. */
  showSchoolSwitcher: boolean;
  /** Select the last class used at `schoolId` (else its first active class) and return it. */
  selectSchool: (schoolId: string) => Class | null;
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

/** API row → Class. An older backend omits `my_role`: a class you created is yours to teach. */
function toClass(raw: ApiClass, userId: string | undefined): Class {
  return {
    ...raw,
    my_role: raw.my_role ?? (userId !== undefined && raw.created_by === userId ? 'instructor' : 'student'),
    institution: raw.institution ?? null,
  };
}

function distinctSchools(classes: Class[]): School[] {
  const byId = new Map<string, School>();
  for (const c of classes) {
    if (c.institution && !byId.has(c.institution.id)) byId.set(c.institution.id, c.institution);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The role the UI shows: while previewing, the selected class you teach shows as a student's. */
function roleInView(cls: Class, selectedId: string | undefined, previewing: boolean): ClassRole {
  return previewing && cls.my_role === 'instructor' && cls.id === selectedId ? 'student' : cls.my_role;
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

  // Fetches the roster and re-resolves the selection; state is committed once
  // the request settles.
  const lastLoadedAt = useRef(0);
  const loadClasses = useCallback(
    (selectClassId?: string | null) =>
      api
        .getClasses()
        .then((response) => {
          const all = response.classes.map((c) => toClass(c, userId));
          setClasses(all);
          lastLoadedAt.current = Date.now();

          const prefs = getPreferencesSnapshot();
          const visible = filterVisibleClasses(all, prefs);
          const active = filterActiveClasses(all, prefs);
          const preferredId =
            selectClassId !== undefined ? selectClassId : getStoredSelectedClassId();
          // Keep focus on completed classes chosen from My Classes; fall back to an active class.
          const resolved =
            resolveSelectedClass(visible, preferredId) ?? resolveSelectedClass(active, null);
          setSelectedClass(resolved);
        })
        .catch((error: unknown) => {
          console.error('Failed to fetch classes:', error);
        })
        .finally(() => {
          setLoading(false);
        }),
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
    () =>
      currentSchool && !activeSchools.some((s) => s.id === currentSchool.id)
        ? [...activeSchools, currentSchool]
        : activeSchools,
    [activeSchools, currentSchool],
  );
  const sidebarClasses = useMemo(
    () =>
      showSchoolSwitcher && currentSchool
        ? activeClasses.filter((c) => c.institution?.id === currentSchool.id)
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

  // The first load; `loading` already starts out true.
  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  // Keep storage on the selected class, including a fallback picked above.
  const selectedClassId = selectedClass?.id;
  useEffect(() => {
    if (selectedClassId) persistSelectedClassId(selectedClassId);
  }, [selectedClassId]);

  // Remember the class last used at each school, for the school switcher.
  const selectedSchoolId = selectedClass?.institution?.id;
  useEffect(() => {
    if (selectedClassId && selectedSchoolId) rememberClassForSchool(selectedSchoolId, selectedClassId);
  }, [selectedClassId, selectedSchoolId]);

  // "View class as student" previews one class: picking another class ends it. The first
  // selection (classes arriving) is not a switch.
  const previewedClassId = useRef(selectedClassId);
  useEffect(() => {
    const previous = previewedClassId.current;
    if (previous === selectedClassId) return;
    previewedClassId.current = selectedClassId;
    if (previous !== undefined && isPreviewing) exitPreview();
  }, [selectedClassId, isPreviewing, exitPreview]);

  // A TA promoted or a class joined elsewhere shows up when the tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadedAt.current < REFRESH_ON_FOCUS_MS) return;
      // Regaining focus fires both events: stamp now so the burst sends one request.
      lastLoadedAt.current = Date.now();
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
  const { selectedClass, loading } = useClass();
  const { isPreviewing } = usePreview();
  if (!selectedClass) return loading ? undefined : null;
  return roleInView(selectedClass, selectedClass.id, isPreviewing);
};

/** Your role in `classId`: undefined while classes load, null when you are not in it (or no id). */
// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useClassRole = (classId: string | null | undefined): ClassRole | null | undefined => {
  const { classes, selectedClass, loading } = useClass();
  const { isPreviewing } = usePreview();
  if (!classId) return null;
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return loading ? undefined : null;
  return roleInView(cls, selectedClass?.id, isPreviewing);
};
