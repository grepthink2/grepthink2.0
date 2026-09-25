import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { UserRole } from '@/features/app/config/sidebar';
import { AUTH_UNAUTHORIZED_EVENT } from './authEvents';
import { apiRequest } from './api/client';
import type { ApiProfile } from './api/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * `profiles.role === 'instructor'`: the account may create classes. It is the only thing the
   * account role decides — everything else follows your role in the selected class
   * (useSelectedClassRole in lib/classContext.tsx).
   */
  canCreateClasses: boolean;
  /**
   * The profile answered and carries no role: its owner signed up with Google and has
   * not chosen one yet. Every role-gated endpoint refuses them, so ProtectedRoute sends
   * them to /select. Never true just because the profile could not be fetched.
   */
  needsRole: boolean;
  /** Re-read the role from the profile, e.g. right after the user has picked one. */
  refreshRole: () => Promise<void>;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

/** `'instructor'` or `'student'` for a recognised role value, otherwise `null`. */
function toUserRole(value: unknown): UserRole | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'instructor' || normalized === 'student' ? normalized : null;
}

interface ProfileRole {
  userId: string;
  role: UserRole | null;
  /** False when the profile could not be read, which says nothing about the role. */
  answered: boolean;
}

/** The role the backend authorizes `userId` by. Never rejects. */
function fetchProfileRole(userId: string): Promise<ProfileRole> {
  return apiRequest<ApiProfile>('/api/profiles/me').then(
    (profile) => ({ userId, role: toUserRole(profile?.role), answered: true }),
    // The API is unreachable: keep the metadata role rather than blocking the app.
    () => ({ userId, role: null, answered: false }),
  );
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
  const [profileRole, setProfileRole] = useState<ProfileRole | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchProfileRole(userId).then((next) => {
      if (!cancelled) setProfileRole(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshRole = useCallback(async () => {
    if (!userId) return;
    setProfileRole(await fetchProfileRole(userId));
  }, [userId]);

  const value = useMemo<AuthContextValue>(() => {
    const metadataRole = toUserRole(
      (session?.user?.user_metadata as { role?: unknown } | undefined)?.role,
    );
    const resolved = profileRole && profileRole.userId === userId ? profileRole : null;
    const accountRole: UserRole = resolved?.role ?? metadataRole ?? 'student';
    // With no metadata role there is nothing to render with yet, so hold the UI
    // until the profile answers instead of showing an instructor the student app
    // (and letting the route guards redirect them).
    const resolvingRole = userId !== null && metadataRole === null && resolved === null;

    return {
      session,
      user: session?.user ?? null,
      loading: loading || resolvingRole,
      canCreateClasses: accountRole === 'instructor',
      needsRole: resolved !== null && resolved.answered && resolved.role === null,
      refreshRole,
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
  }, [session, loading, profileRole, userId, refreshRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useUser = () => {
  const { user, loading } = useAuth();
  return { user, isLoaded: !loading };
};
