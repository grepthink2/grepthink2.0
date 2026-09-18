/** Window event that `apiRequest` dispatches when the backend answers 401 for the current session. */
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

export function announceUnauthorized(): void {
  window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
}
