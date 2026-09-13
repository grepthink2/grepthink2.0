import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { UserRole } from '@/features/app/config/sidebar';
import { usePreview } from './previewContext';
import { AUTH_UNAUTHORIZED_EVENT } from './authEvents';
import { apiRequest } from './api/client';
import type { ApiProfile } from './api/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * Effective role driving the UI. In "View as Student" preview this is forced
   * to 'student' so the sidebar, route guards, and page branching all simulate
   * the student experience. Use `realRole` when you need the true account role.
   */
  role: UserRole;
  /** The account's true role, unaffected by preview mode. */
  realRole: UserRole;
  /** Whether "View as Student" preview is currently active. */
  isPreviewing: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

/** `'instructor'` or `'student'` for a recognised role value, otherwise `null`. */
function toUserRole(value: unknown): UserRole | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'instructor' || normalized === 'student' ? normalized : null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    // Supabase fires onAuthStateChange for every lifecycle transition:
    //
    //   INITIAL_SESSION  - first load, session restored from localStorage
    //   SIGNED_IN        - successful sign-in
    //   SIGNED_OUT       - explicit signOut() or token invalidated
    //   TOKEN_REFRESHED  - silent refresh produced a new access token
    //   USER_UPDATED     - email/password/metadata updated
    //
    // Because localStorage is shared across tabs, these events also
    // propagate cross-tab: signing out in tab A triggers SIGNED_OUT in
    // tab B on the next render tick, which in turn clears `session` and
    // bumps ProtectedRoute to /login. We don't need a BroadcastChannel.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (import.meta.env.DEV) {
        console.debug('[auth] state change:', event, 'has session:', !!nextSession);
      }
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // apiRequest announces a 401: the backend no longer accepts this session even
  // after Supabase's own refresh, so drop it locally and let ProtectedRoute send
  // the user to /login instead of every screen failing.
  useEffect(() => {
    const onUnauthorized = () => {
      void supabase.auth.signOut({ scope: 'local' });
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // The backend authorizes by profiles.role (AUTH.md, "Role source-of-truth: DB,
  // not JWT"). user_metadata.role is written only by the signup flow, so an
  // account created any other way has none and used to get the student UI while
  // the API treated it as an instructor. Keyed by user id so one account's role
  // never carries over to the next session in this tab.
  const userId = session?.user?.id ?? null;
  const [profileRole, setProfileRole] = useState<{ userId: string; role: UserRole | null } | null>(
    null,
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiRequest<ApiProfile>('/api/profiles/me')
      .then((profile) => {
        if (!cancelled) setProfileRole({ userId, role: toUserRole(profile?.role) });
      })
      .catch(() => {
        // No profile row yet (first OAuth login) or the API is unreachable: keep
        // the metadata role rather than blocking the app.
        if (!cancelled) setProfileRole({ userId, role: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<AuthContextValue>(() => {
    const metadataRole = toUserRole(
      (session?.user?.user_metadata as { role?: unknown } | undefined)?.role,
    );
    const resolved = profileRole && profileRole.userId === userId ? profileRole : null;
    const role: UserRole = resolved?.role ?? metadataRole ?? 'student';
    // With no metadata role there is nothing to render with yet, so hold the UI
    // until the profile answers instead of showing an instructor the student app
    // (and letting the route guards redirect them).
    const resolvingRole = userId !== null && metadataRole === null && resolved === null;

    return {
      session,
      user: session?.user ?? null,
      loading: loading || resolvingRole,
      // Provider exposes the true role; the `useAuth` hook below overlays
      // preview state (it can't be read here — PreviewProvider is a descendant).
      role,
      realRole: role,
      isPreviewing: false,
      getToken: async () => {
        // Try the cached session first (cheap, no network).
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) return data.session.access_token;

        // No session in storage: could mean the access token expired
        // between renders. Attempt one silent refresh before giving up
        // — this closes the "user is truthy but token is null" race
        // that Home.tsx used to surface as "Not authenticated".
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (error) {
          console.warn('[auth] refreshSession failed:', error.message);
          return null;
        }
        return refreshed.session?.access_token ?? null;
      },
      signOut: async () => {
        // scope: 'global' invalidates the refresh token on Supabase's
        // side so other devices/tabs also drop out of the session.
        await supabase.auth.signOut({ scope: 'global' });
      },
    };
  }, [session, loading, profileRole, userId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  // Overlay "View as Student" preview. Only an instructor can preview, so a
  // student account is never affected. `usePreview` safely returns a
  // not-previewing default when no PreviewProvider is mounted (e.g. /login).
  const { isPreviewing } = usePreview();
  const previewing = isPreviewing && ctx.realRole === 'instructor';

  return {
    ...ctx,
    role: previewing ? 'student' : ctx.realRole,
    isPreviewing: previewing,
  };
};

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useUser = () => {
  const { user, loading } = useAuth();
  return { user, isLoaded: !loading };
};
