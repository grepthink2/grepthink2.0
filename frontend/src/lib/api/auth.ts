/** Sign-in checks and account creation: endpoint methods spread into the `api` object in lib/api.ts. */
import { API_BASE_URL, apiRequest } from './client';

export const authApi = {
  // Auth
  loginCheck: async () => {
    return apiRequest<{ message: string; user_id: string; role: string | null }>('/api/login-check');
  },

  checkEmail: async (email: string): Promise<{ available: boolean } | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  },

  /**
   * Create the profiles row for a newly-authenticated user.
   * The backend verifies that the JWT's ``sub`` matches ``userId`` in the
   * body, so the caller cannot provision a profile for someone else.
   */
  createUser: async (data: {
    userId: string;
    email: string;
    userType: 'student' | 'instructor';
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  }) => {
    return apiRequest<{ message: string; email: string; role: string }>('/api/create-user', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
