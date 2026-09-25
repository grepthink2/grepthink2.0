/**
 * Backend API client.
 *
 * Endpoint methods live by domain in lib/api/*.ts, request plumbing (auth
 * header, read-only preview guard, ApiError) in lib/api/client.ts and the
 * request/response types in lib/api/types.ts. This module assembles the `api`
 * object and re-exports the rest, so screens keep importing from '@/lib/api'.
 */
import { authApi } from './api/auth';
import { classesApi } from './api/classes';
import { institutionsApi } from './api/institutions';
import { projectsApi } from './api/projects';
import { assignmentsApi } from './api/assignments';
import { tasApi } from './api/tas';
import { messagesApi } from './api/messages';
import { notificationsApi } from './api/notifications';
import { interestApi } from './api/interest';
import { staffingApi } from './api/staffing';

export * from './api/types';
export { ApiError, apiRequest, apiUpload } from './api/client';

export const api = {
  ...authApi,
  ...classesApi,
  ...institutionsApi,
  ...projectsApi,
  ...assignmentsApi,
  ...tasApi,
  ...messagesApi,
  ...notificationsApi,
  ...interestApi,
  ...staffingApi,
};
