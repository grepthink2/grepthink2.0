/** Global search: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type { ApiSearchIndex } from './types';

export const searchApi = {
  /** Everything the signed-in user can open, for the ⌘K palette to rank locally. */
  getSearchIndex: async (signal?: AbortSignal) =>
    apiRequest<ApiSearchIndex>('/api/search/index', { signal }),
};
