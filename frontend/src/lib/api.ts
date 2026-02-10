import { supabase } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

/**
 * Make an authenticated API request to the backend
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Get the current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('No authentication token available');
  }

  // Prepare headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  // Make the request
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle errors
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  // Parse and return JSON
  return response.json();
}

/**
 * API client for backend endpoints
 */
export const api = {
  // Auth
  loginCheck: async () => {
    return apiRequest<{ message: string; user_id: string; role: string }>('/api/login-check');
  },

  // Classes
  createClass: async (data: { name: string; description?: string }) => {
    return apiRequest('/api/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getClasses: async () => {
    return apiRequest<{ classes: any[] }>('/api/classes');
  },

  getClass: async (classId: string) => {
    return apiRequest<{ class: any }>(`/api/classes/${classId}`);
  },

  joinClass: async (courseCode: string) => {
    return apiRequest('/api/classes/join', {
      method: 'POST',
      body: JSON.stringify({ course_code: courseCode }),
    });
  },

  getClassStudents: async (classId: string) => {
    return apiRequest<{ students: any[] }>(`/api/classes/${classId}/students`);
  },
};
