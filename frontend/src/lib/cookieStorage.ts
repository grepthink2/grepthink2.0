/**
 * Cookie-based storage adapter for Supabase auth.
 * Uses __Host-session cookie (Secure, Path=/, no Domain per spec).
 */
const COOKIE_NAME = '__Host-session';
const MAX_AGE_DAYS = 7;

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp('(^| )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]+)')
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return match[2];
  }
}

function setCookie(name: string, value: string): void {
  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; Secure; SameSite=Lax`;
}

function removeCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; Secure; SameSite=Lax`;
}

export const cookieStorage = {
  getItem(_key: string): string | null {
    return getCookie(COOKIE_NAME);
  },
  setItem(_key: string, value: string): void {
    setCookie(COOKIE_NAME, value);
  },
  removeItem(_key: string): void {
    removeCookie(COOKIE_NAME);
  },
};
