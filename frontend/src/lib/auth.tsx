import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { UserRole } from '@/features/app/config/sidebar';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: UserRole;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
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
        // eslint-disable-next-line no-console
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

  const value = useMemo<AuthContextValue>(() => {
    const raw = String(
      (session?.user?.user_metadata as { role?: string } | undefined)?.role ?? ''
    ).toLowerCase();
    const role: UserRole = raw === 'instructor' ? 'instructor' : 'student';

    return {
      session,
      user: session?.user ?? null,
      loading,
      role,
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
          // eslint-disable-next-line no-console
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
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};

export const useUser = () => {
  const { user, loading } = useAuth();
  return { user, isLoaded: !loading };
};
