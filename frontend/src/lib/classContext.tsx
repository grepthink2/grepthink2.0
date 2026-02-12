import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';

export interface Class {
  id: string;
  name: string;
  description?: string;
  course_code?: string;
  created_by: string;
  created_at: string;
  teacher_email?: string;
}

interface ClassContextValue {
  classes: Class[];
  selectedClass: Class | null;
  setSelectedClass: (classItem: Class | null) => void;
  refreshClasses: () => Promise<void>;
  loading: boolean;
}

const ClassContext = createContext<ClassContextValue | undefined>(undefined);

export const ClassProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshClasses = async () => {
    try {
      setLoading(true);
      const response = await api.getClasses();
      setClasses(response.classes);
      
      // If we have a selected class, update it with fresh data
      if (selectedClass) {
        const updatedClass = response.classes.find((c: Class) => c.id === selectedClass.id);
        if (updatedClass) {
          setSelectedClass(updatedClass);
        } else {
          // Selected class no longer exists
          setSelectedClass(null);
        }
      } else if (response.classes.length > 0) {
        // Auto-select first class if none selected
        setSelectedClass(response.classes[0]);
      }
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshClasses();
  }, []);

  return (
    <ClassContext.Provider
      value={{
        classes,
        selectedClass,
        setSelectedClass,
        refreshClasses,
        loading,
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
