/** Project interest forms: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type {
  ApiStaffingRankedProject,
  ApiStaffingSubmission,
  SubmitInterestFormPayload,
} from './types';

export const interestApi = {

  // ----- Staffing / Interest form ----------------------------------------

  /** Current user's full interest-form payload for the class. */
  getMyInterestSubmission: async (classId: string) => {
    return apiRequest<{ submission: ApiStaffingSubmission }>(
      `/api/staffing/${classId}/my-submission`,
    );
  },

  /** Current user's ranked-project rows for the class (highest first). */
  getMyInterests: async (classId: string) => {
    return apiRequest<{ interests: ApiStaffingRankedProject[] }>(
      `/api/staffing/${classId}/my-interests`,
    );
  },

  /**
   * Atomic full-form submit. Replaces the user's interest_form rows and
   * team_preferences for the class and upserts the background fields.
   */
  submitInterestForm: async (classId: string, data: SubmitInterestFormPayload) => {
    return apiRequest<{ message: string; submission: ApiStaffingSubmission }>(
      `/api/staffing/${classId}/submission`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  },
};
