import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
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

function resolveSelectedClass(classes: Class[], preferredId: string | null): Class | null {
  if (preferredId) {
    const match = classes.find((c) => c.id === preferredId);
    if (match) return match;
  }
  return classes.length > 0 ? classes[0] : null;
}

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
}

interface ClassContextValue {
  classes: Class[];
  /** Classes visible in My Classes (excludes user-hidden). */
  visibleClasses: Class[];
  /** Active classes shown in the sidebar selector. */
  sidebarClasses: Class[];
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

function filterSidebarClasses(all: Class[], preferences: ClassPreferenceMap): Class[] {
  return filterVisibleClasses(all, preferences).filter(
    (c) => getClassDisplayStatus(c) === 'active',
  );
}

export const ClassProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClassState] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<ClassPreferenceMap>(() => loadClassPreferences());

  const visibleClasses = useMemo(
    () => filterVisibleClasses(classes, preferences),
    [classes, preferences],
  );

  const sidebarClasses = useMemo(
    () => filterSidebarClasses(classes, preferences),
    [classes, preferences],
  );

  const setSelectedClass = useCallback((classItem: Class | null) => {
    setSelectedClassState(classItem);
    persistSelectedClassId(classItem?.id ?? null);
  }, []);

  const reselectSidebarClass = useCallback(
    (preferredId: string | null) => {
      const resolved = resolveSelectedClass(sidebarClasses, preferredId);
      setSelectedClass(resolved);
    },
    [sidebarClasses, setSelectedClass],
  );

  const refreshClasses = useCallback(
    async (showLoading = true, selectClassId?: string | null) => {
      try {
        if (showLoading) setLoading(true);
        const response = await api.getClasses();
        setClasses(response.classes);

        const prefs = getPreferencesSnapshot();
        const visible = filterVisibleClasses(response.classes, prefs);
        const sidebar = filterSidebarClasses(response.classes, prefs);
        const preferredId =
          selectClassId !== undefined ? selectClassId : getStoredSelectedClassId();
        // Keep focus on completed classes chosen from My Classes; fall back to an active class.
        const resolved =
          resolveSelectedClass(visible, preferredId) ?? resolveSelectedClass(sidebar, null);
        setSelectedClass(resolved);
      } catch (error) {
        console.error('Failed to fetch classes:', error);
      } finally {
        setLoading(false);
      }
    },
    [setSelectedClass],
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

  useEffect(() => {
    void refreshClasses();
  }, [refreshClasses]);

  // Clear focus only when the class is hidden or no longer in the roster (not when completed).
  useEffect(() => {
    if (!selectedClass) return;
    const stillVisible = visibleClasses.some((c) => c.id === selectedClass.id);
    if (!stillVisible) {
      reselectSidebarClass(null);
    }
  }, [visibleClasses, selectedClass, reselectSidebarClass]);

  return (
    <ClassContext.Provider
      value={{
        classes,
        visibleClasses,
        sidebarClasses,
        selectedClass,
        setSelectedClass,
        refreshClasses,
        loading,
        successMessage,
        setSuccessMessage,
        getClassStatus,
        setClassLifecycleStatus,
        hideClassFromUI,
      }}
    >
      {children}
    </ClassContext.Provider>
  );
};

export const useClass = () => {
  const context = useContext(ClassContext);
  if (!context) {
    throw new Error('useClass must be used within ClassProvider');
  }
  return context;
};
