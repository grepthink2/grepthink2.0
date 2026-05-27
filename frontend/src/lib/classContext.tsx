import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';

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
}

interface ClassContextValue {
  classes: Class[];
  selectedClass: Class | null;
  setSelectedClass: (classItem: Class | null) => void;
  // Accept showLoading param to avoid blocking UI when refreshing after join
  refreshClasses: (showLoading?: boolean) => Promise<void>;
  loading: boolean;
  // Success message state for cross-component notifications (e.g., after joining class)
  successMessage: string | null;
  setSuccessMessage: (message: string | null) => void;
}

const ClassContext = createContext<ClassContextValue | undefined>(undefined);

export const ClassProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClassState] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const setSelectedClass = useCallback((classItem: Class | null) => {
    setSelectedClassState(classItem);
    persistSelectedClassId(classItem?.id ?? null);
  }, []);

  const refreshClasses = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await api.getClasses();
      setClasses(response.classes);

      const resolved = resolveSelectedClass(
        response.classes,
        getStoredSelectedClassId(),
      );
      setSelectedClass(resolved);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    } finally {
      setLoading(false);
    }
  }, [setSelectedClass]);

  useEffect(() => {
    void refreshClasses();
  }, [refreshClasses]);

  return (
    <ClassContext.Provider
      value={{
        classes,
        selectedClass,
        setSelectedClass,
        refreshClasses,
        loading,
        successMessage,
        setSuccessMessage,
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
