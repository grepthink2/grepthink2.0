import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { setReadOnly } from './previewGuard';

/**
 * "View as Student" preview mode.
 *
 * An instructor can flip into a read-only simulation of the student UI. While
 * active:
 *   - `useAuth().role` reports 'student' (see lib/auth.tsx), so the sidebar,
 *     route guards, and per-page branching all render the student experience;
 *   - every mutating API call is blocked by the read-only guard;
 *   - `previewProjectId` (optional) binds the "My Project" experience to a
 *     specific project the instructor chose to inspect as a member.
 *
 * State is intentionally in-memory only: a page refresh exits preview, so an
 * instructor can never get silently stuck in a read-only session.
 */
interface PreviewContextValue {
  isPreviewing: boolean;
  /** Project the instructor is previewing as a member of, if any. */
  previewProjectId: string | null;
  /** Enter preview, optionally bound to a project (for "preview as member"). */
  enterPreview: (projectId?: string | null) => void;
  exitPreview: () => void;
  /** Change the bound project without leaving preview. */
  setPreviewProject: (projectId: string | null) => void;
}

const PreviewContext = createContext<PreviewContextValue | undefined>(undefined);

export const PreviewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewProjectId, setPreviewProjectId] = useState<string | null>(null);

  const enterPreview = useCallback((projectId: string | null = null) => {
    setPreviewProjectId(projectId ?? null);
    setIsPreviewing(true);
  }, []);

  const exitPreview = useCallback(() => {
    setIsPreviewing(false);
    setPreviewProjectId(null);
  }, []);

  const setPreviewProject = useCallback((projectId: string | null) => {
    setPreviewProjectId(projectId);
  }, []);

  // Keep the module-level read-only guard in sync with preview state so the
  // API client blocks writes the moment we enter preview.
  useEffect(() => {
    setReadOnly(isPreviewing);
    return () => setReadOnly(false);
  }, [isPreviewing]);

  const value = useMemo<PreviewContextValue>(
    () => ({ isPreviewing, previewProjectId, enterPreview, exitPreview, setPreviewProject }),
    [isPreviewing, previewProjectId, enterPreview, exitPreview, setPreviewProject],
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
};

/**
 * Read preview state. Returns a safe default (not previewing) when no provider
 * is mounted, so components and the `useAuth` hook can call it unconditionally.
 */
export const usePreview = (): PreviewContextValue => {
  const ctx = useContext(PreviewContext);
  if (!ctx) {
    return {
      isPreviewing: false,
      previewProjectId: null,
      enterPreview: () => {},
      exitPreview: () => {},
      setPreviewProject: () => {},
    };
  }
  return ctx;
};
