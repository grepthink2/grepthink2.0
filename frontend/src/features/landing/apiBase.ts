// Dev: relative path so the Vite proxy routes /api to the backend.
// Prod: VITE_API_URL, falling back to same-origin (never localhost).
export const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '');
