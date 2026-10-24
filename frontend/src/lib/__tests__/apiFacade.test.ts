import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: {} } }));

import { ApiError, api, emptyMySubmissions } from '../api';
import { analyticsApi } from '../api/analytics';
import { assignmentsApi } from '../api/assignments';
import { authApi } from '../api/auth';
import { classesApi } from '../api/classes';
import { emailApi } from '../api/email';
import { institutionsApi } from '../api/institutions';
import { interestApi } from '../api/interest';
import { messagesApi } from '../api/messages';
import { notificationsApi } from '../api/notifications';
import { projectsApi } from '../api/projects';
import { scrumApi } from '../api/scrum';
import { searchApi } from '../api/search';
import { staffingApi } from '../api/staffing';
import { tasApi } from '../api/tas';

/** The domain clients lib/api.ts spreads into `api`. */
const DOMAINS: Record<string, object> = {
  analyticsApi,
  assignmentsApi,
  authApi,
  classesApi,
  emailApi,
  institutionsApi,
  interestApi,
  messagesApi,
  notificationsApi,
  projectsApi,
  scrumApi,
  searchApi,
  staffingApi,
  tasApi,
};

/** Every endpoint method the app calls through `api`, captured before lib/api.ts was split by domain. */
const METHODS = [
  'acceptProjectJoinRequest',
  'addManualRosterStudent',
  'addProjectMember',
  'addScrumRepo',
  'addTaskDependency',
  'aiDraftScrum',
  'assignAdmin',
  'assignProductOwner',
  'assignProjectTA',
  'assignScrumMaster',
  'bookReviewSlot',
  'bulkInviteStudents',
  'cancelInvite',
  'cancelJoinRequest',
  'cancelTeamInvite',
  'checkEmail',
  'confirmUnsubscribe',
  'createAssignment',
  'createClass',
  'createProject',
  'createProjectMeeting',
  'createProjectTsr',
  'createReviewSlots',
  'createScrumComment',
  'createScrumTask',
  'createSprint',
  'createStory',
  'createUser',
  'deleteAssignment',
  'deleteConversation',
  'deleteManualRosterEntry',
  'deleteProject',
  'deleteProjectMeeting',
  'deleteReviewSlot',
  'deleteScrumRepo',
  'deleteScrumStory',
  'deleteScrumTask',
  'demoteTA',
  'dismissJoinRequest',
  'getAnalyticsDashboard',
  'getAnalyticsScope',
  'getAssignmentTsrOverview',
  'getAssignments',
  'getClassProjects',
  'getClassProjectsOverview',
  'getClassRoster',
  'getClassRosterTimeline',
  'getClassStudents',
  'getClassTAs',
  'getClassTaRoster',
  'getClassTurnInStats',
  'getClasses',
  'getClassesAttentionSummary',
  'getContacts',
  'getConversations',
  'getEmailPreferences',
  'getFeedbackOverview',
  'getFinalReviewDetail',
  'getFinalReviewSchedule',
  'getIncomingJoinRequests',
  'getInstitutions',
  'getMessages',
  'getMyAssignedTeams',
  'getMyAssignmentTsrs',
  'getMyEnrollmentRole',
  'getMyFeedback',
  'getMyInterestSubmission',
  'getMyInterests',
  'getMyJoinRequests',
  'getMySubmissions',
  'getMyTeamSchedule',
  'getNotifications',
  'getPendingTeamInvites',
  'getProject',
  'getProjectJoinRequests',
  'getProjectMeetings',
  'getProjectMembers',
  'getProjectPendingInvites',
  'getProjectTAs',
  'getProjectTsrs',
  'getProjects',
  'getReviewSlots',
  'getScrumBoard',
  'getScrumComments',
  'getScrumRepos',
  'getScrumSummary',
  'getSearchIndex',
  'getStaffingAssignments',
  'getStaffingProjectRank',
  'getStaffingStudents',
  'getTAMeetingSchedule',
  'getTAReviewTargets',
  'getTeamAttendance',
  'getUnsubscribeInfo',
  'inviteStudent',
  'joinClass',
  'leaveClass',
  'loginCheck',
  'markAllNotificationsRead',
  'markAllPresent',
  'markConversationRead',
  'markNotificationRead',
  'moveScrumTask',
  'promoteToTA',
  'queueInvite',
  'refreshScrumPrStates',
  'rejectProjectJoinRequest',
  'releaseReviewSlot',
  'releaseReviewTA',
  'removeAdmin',
  'removeProductOwner',
  'removeProjectMember',
  'removeScrumMaster',
  'removeStudentFromClass',
  'removeTaskDependency',
  'requestJoinProject',
  'saveFinalReviewNotes',
  'saveFinalReviewScores',
  'sendMessage',
  'setClassTA',
  'setMeetingCadence',
  'setReviewTA',
  'setReviewWindow',
  'setReviewZoom',
  'staffingAssign',
  'staffingAutoAssign',
  'staffingUnassign',
  'submitFeedback',
  'submitInterestForm',
  'updateAssignment',
  'updateAssignmentTsr',
  'updateClassEndDate',
  'updateClassExternalTasksUrl',
  'updateClassStatus',
  'updateEmailPreferences',
  'updateProject',
  'updateProjectMeeting',
  'updateProjectMeetingSlot',
  'updateScrumSettings',
  'updateScrumTask',
  'updateSprint',
  'updateStory',
  'uploadClassRoster',
  'upsertAttendance',
];

describe('api facade', () => {
  it('exposes every endpoint method', () => {
    expect(Object.keys(api).sort()).toEqual(METHODS);
    for (const name of METHODS) {
      expect(typeof (api as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('takes each method from exactly one domain client', () => {
    const owners = new Map<string, string[]>();
    for (const [domain, client] of Object.entries(DOMAINS)) {
      for (const name of Object.keys(client)) owners.set(name, [...(owners.get(name) ?? []), domain]);
    }
    // Two clients with one name would leave `api` with whichever spreads last, and nothing would say so.
    const shared = [...owners].filter(([, domains]) => domains.length > 1).map(([name, domains]) => `${name}: ${domains.join(', ')}`);
    expect(shared).toEqual([]);
    // And these are all the clients api.ts spreads: together they make up `api`.
    expect([...owners.keys()].sort()).toEqual(Object.keys(api).sort());
  });

  it('re-exports the shared values and the error type', () => {
    expect(emptyMySubmissions()).toEqual({ tsrs: [], feedback_assignment_ids: [] });
    expect(new ApiError(404, 'Not found', 'Request failed')).toBeInstanceOf(Error);
  });
});
