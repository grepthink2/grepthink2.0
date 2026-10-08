/** Request and response types for the backend API, re-exported by lib/api.ts. */

/** The signed-in user's role in one class: its creator, a TA, or an enrolled student. */
export type ClassRole = 'instructor' | 'ta' | 'student';

/** A school, as a class row embeds it. */
export interface ApiInstitutionSummary {
  id: string;
  name: string;
  slug: string;
}

/** A school with the email domains that count as its school email (GET /api/institutions). */
export interface ApiInstitution extends ApiInstitutionSummary {
  email_domains: string[];
  /** The school's IANA time zone, e.g. "Europe/Istanbul". Missing from older backends. */
  timezone?: string;
}

export interface ApiClass {
  id: string;
  name: string;
  description?: string;
  course_code?: string;
  created_by: string;
  created_at: string;
  teacher_email?: string;
  term?: string;
  start_date?: string;
  year?: number;
  image_url?: string;
  status?: 'active' | 'complete';
  /** My Classes: live enrollment count from class_enrollments. */
  enrolled_count?: number;
  /** The caller's role in this class (GET /api/classes). Missing from older backends. */
  my_role?: ClassRole;
  /** The school the class belongs to; null when unassigned or before the institutions migration. */
  institution?: ApiInstitutionSummary | null;
  institution_id?: string | null;
}

/**
 * Class-level role on a class_enrollments row. A TA is an enrollment with 'ta', whatever the
 * account role (profiles.role) is.
 */
export type EnrollmentRole = 'student' | 'ta';

export interface ApiStudent {
  id: string;
  email: string;
  user_id?: string;
  role: string;
  /** Class-scoped role: 'student' or 'ta'. */
  enrollment_role?: EnrollmentRole;
  first_name?: string;
  last_name?: string;
  project_id?: string | null;
  project_name?: string | null;
}

/** A TA in a class, with the projects they oversee. */
export interface ApiClassTA {
  id: string;
  name: string;
  email: string | null;
  projects: { id: string; name: string | null }[];
}

// ----- TA meeting schedule + attendance (app/attendance backend) ------------

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'unmarked';

export interface ApiAssignedTa {
  id: string;
  name: string | null;
  email?: string | null;
  image_url?: string | null;
}

export interface ApiTeamMeeting {
  project_id: string;
  project_name: string;
  /** The weekly meeting slot row this entry reflects; null until one exists. */
  meeting_id?: string | null;
  meeting_day?: string | null;
  meeting_time?: string | null;
  zoom_url?: string | null;
  assigned_ta?: ApiAssignedTa | null;
  attendance_present: number;
  attendance_total: number;
  /** The viewer's own status for the selected meeting; null when they are not on this team. */
  viewer_status?: AttendanceStatus | null;
}

export interface ApiTAMeetingSchedule {
  class_id: string;
  week_number: number;
  total_weeks: number;
  week_of?: string | null;
  /** Which meeting within the week this schedule's attendance reflects (1..meetings_per_week). */
  meeting_in_week: number;
  /** TA meetings per week for this class (1 = once weekly). */
  meetings_per_week: number;
  meeting_duration_minutes?: number | null;
  /** total_weeks * meetings_per_week. */
  total_meetings: number;
  teams: ApiTeamMeeting[];
}

/** A TA on the final-review schedule (Home TA, or the claimed Review TA). */
export interface ApiFinalReviewTa {
  user_id: string;
  name: string | null;
  email?: string | null;
  claimed_at?: string | null;
}

/** One team's row on the final-review schedule. */
export interface ApiFinalReviewTeam {
  project_id: string;
  name: string | null;
  /** ISO timestamptz of the team's review slot; null = unscheduled. */
  final_review_at: string | null;
  home_ta: ApiFinalReviewTa | null;
  /** The additional reviewer; null = open slot. */
  review_ta: ApiFinalReviewTa | null;
}

export interface ApiFinalReviewSchedule {
  class_id: string;
  /** The ONE shared Zoom room every final review happens in. */
  review_zoom_url: string | null;
  review_period_open: boolean;
  /** Teams where the current viewer is the Review TA. */
  my_review_count: number;
  teams: ApiFinalReviewTeam[];
}

/** Who entered a final-review score row: the team's Home TA (3 category
 * scores), its Review TA (one overall), or the instructor (one overall). */
export type FinalReviewScoreRole = 'home' | 'review' | 'instructor';

/** One student's saved scores for one scorer role (1.0–5.0, 0.1 steps). */
export interface ApiFinalReviewScoreRow {
  student_id: string;
  role: FinalReviewScoreRole;
  product: number | null;
  team: number | null;
  scrum: number | null;
  overall: number | null;
  notes: string | null;
  scored_by?: string | null;
  updated_at?: string | null;
}

/** The Review TA's structured notes worksheet for a team. */
export interface ApiFinalReviewNotes {
  content: Record<string, unknown>;
  template_version: number;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface ApiFinalReviewMember {
  user_id: string;
  name: string | null;
  email?: string | null;
}

export interface ApiFinalReviewDetail {
  project: { project_id: string; name: string | null; final_review_at: string | null };
  review_zoom_url: string | null;
  review_period_open: boolean;
  home_ta: ApiFinalReviewTa | null;
  review_ta: ApiFinalReviewTa | null;
  members: ApiFinalReviewMember[];
  scores: ApiFinalReviewScoreRow[];
  notes: ApiFinalReviewNotes | null;
  /** The viewer's relationship to THIS team (drives which columns are editable). */
  viewer_role: 'instructor' | 'home' | 'review' | 'ta';
}

/** Editable score fields for one student (role decides which apply). */
export interface FinalReviewScoreEntry {
  student_id: string;
  product?: number | null;
  team?: number | null;
  scrum?: number | null;
  overall?: number | null;
  notes?: string | null;
}

export interface ApiAttendanceEntry {
  person_id: string;
  name: string | null;
  email?: string | null;
  image_url?: string | null;
  status: AttendanceStatus;
}

export interface ApiTeamAttendance {
  project_id: string;
  week_number: number;
  meeting_in_week: number;
  entries: ApiAttendanceEntry[];
}

/** A class member with their class-TA designation flag (attendance feature). */
export interface ApiClassTa {
  user_id: string;
  name: string | null;
  email?: string | null;
  image_url?: string | null;
  is_ta: boolean;
}

/** A TA assigned to a specific project. */
export interface ApiProjectTA {
  user_id: string;
  name: string;
  email: string | null;
  assigned_at?: string;
}

export interface ApiRosterStudent {
  id: string;
  name: string;
  email: string;
  first_name?: string;
  last_name?: string;
  roster_email?: string;
  grepthink_email?: string;
  project?: string;
  class_status: 'enrolled' | 'waitlisted' | 'dropped' | 'not_on_roster' | 'manual';
  grepthink_status: 'registered' | 'not_registered';
  /** Class-scoped role: 'student' or 'ta' (only meaningful when registered). */
  enrollment_role?: EnrollmentRole;
  projects: string[];
  /** roster_entries.id — present only for manually added rows; used to delete them. */
  roster_entry_id?: string | null;
}

export interface ApiRosterTimelineStudent {
  id: string;
  name: string;
  email: string;
  class_status: ApiRosterStudent['class_status'];
  enrolled_at: string | null;
  team_joined_at: string | null;
  project_name: string | null;
  dropped_at: string | null;
}

export interface ApiRosterUploadResult {
  message: string;
  inserted_count: number;
  matched_count: number;
}

export interface ApiBulkInviteResult {
  /** `status` is "queued" for an email the outbox is still trying to send. */
  results: { email: string; status: string }[];
  enrolled_count: number;
  invited_count: number;
  /** Invite emails waiting in the outbox. Missing from older backends. */
  queued_count?: number;
}

export interface ApiProfile {
  id: string;
  email: string;
  role: string;
  first_name?: string;
  last_name?: string;
  linkedin?: string;
  github?: string;
  image_url?: string;
  edu_email?: string;
}

export interface ApiProject {
  id: string;
  class_id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  creator_email?: string;
  team_size?: number;
  looking_for_roles?: string[];
  skills?: string[];
  /** Current user's role on this project (from API). */
  user_role?: string | null;
  member_count?: number;
  image_url?: string;
  /** Assigned product owner / scrum master (from API). */
  product_owner_name?: string | null;
  product_owner_email?: string | null;
  scrum_master_name?: string | null;
  scrum_master_email?: string | null;
  /** Aggregated team sentiment from TSRs: 'positive' | 'neutral' | 'negative'. */
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
  // Sponsor information
  sponsor_name?: string;
  sponsor_company?: string;
  sponsor_email?: string;
  sponsor_website?: string;
  sponsor_description?: string;
}

export interface ApiProjectJoinRequest {
  request_id: string;
  user_id: string;
  email?: string;
  user_role?: string;
  requested_at?: string;
  status: string;
  message?: string | null;
  project_id?: string;
  project_name?: string;
  member_count?: number;
  sponsor_company?: string;
  course_label?: string;
  image_url?: string | null;
}

/** A pending student join request on a team the caller reviews (GET /api/projects/incoming-join-requests). */
export interface ApiIncomingJoinRequest extends ApiProjectJoinRequest {
  project_id: string;
  project_name: string;
  member_count: number;
}

export interface ApiProjectPendingInvite {
  request_id: string;
  user_id: string;
  email?: string;
  invited_at?: string;
}

export interface ApiProjectMember {
  user_id: string;
  email?: string;
  user_role?: string;
  project_role: string;
  joined_at: string;
  first_name?: string;
  last_name?: string;
  linkedin?: string;
  github?: string;
  image_url?: string;
  edu_email?: string | null;
}

export interface CreateProjectPayload {
  class_id: string;
  name: string;
  description?: string;
  team_size: number;
  looking_for_roles?: string[];
  skills?: string[];
  // Sponsor information
  sponsor_name?: string;
  sponsor_company?: string;
  sponsor_email?: string;
  sponsor_website?: string;
  sponsor_description?: string;
}

export interface CreateTsrPayload {
  evaluatee_id: string;
  percent_contribution: number;
  positive_feedback: string;
  constructive_feedback: string;
  scrum_master_tickets?: string;
  scrum_master_assessment?: string;
  scrum_master_notes?: string;
  week?: number;
  assignment_id?: string;
}

export interface ApiTSR {
  id?: string;
  evaluator_id?: string;
  evaluatee_id?: string;
  percent_contribution: number;
  positive_feedback: string;
  constructive_feedback: string;
  scrum_master_tickets?: string;
  scrum_master_assessment?: string;
  scrum_master_notes?: string;
  email?: string;
  assignment_id?: string;
  created_at?: string;
}

/** TSR row returned by GET/PATCH /api/assignments/:id/tsrs */
export interface ApiAssignmentTsrEntry {
  tsr_id: string;
  evaluator_id: string;
  evaluatee_id: string;
  project_id?: string;
  evaluator_name?: string;
  evaluatee_name?: string;
  percent_contribution: number;
  positive_feedback: string;
  constructive_feedback?: string;
  scrum_master_tickets?: string;
  scrum_master_assessment?: string;
  scrum_master_notes?: string;
  submitted_at?: string | null;
  updated_at?: string | null;
}

export interface UpdateAssignmentTsrPayload {
  percent_contribution?: number;
  positive_feedback?: string;
  constructive_feedback?: string;
  scrum_master_tickets?: string;
  scrum_master_assessment?: string;
  scrum_master_notes?: string;
}

export interface ApiAssignment {
  id: string;
  /** Backend uses capital T for this column */
  Title: string;
  open_date: string;
  close_date: string;
  status: 'draft' | 'publish';
  class_id: string;
  assignment_type?: string;
  created_at?: string;
  /** Instructor list: any TSR row exists for this assignment */
  has_tsr_responses?: boolean;
  teams_submitted?: number;
  teams_total?: number;
  feedback_submitted?: number;
  feedback_total?: number;
  /** The deadline instant: the first moment after close_date in the school's time zone. Missing from older backends. */
  due_at?: string | null;
  /** Late-submission window; null or missing = the assignment closes at due_at. */
  accept_until?: string | null;
}

/** The caller's own submissions across a class's assignments (GET /api/assignments/my-submissions). */
export interface ApiMySubmissions {
  /** One entry per (TSR assignment, project) the caller evaluated for; project_id is null only on legacy rows. */
  tsrs: { assignment_id: string; project_id: string | null }[];
  /** Feedback assignments the caller has answered. */
  feedback_assignment_ids: string[];
}

/** Fallback when the submissions read fails: treat everything as not yet submitted. */
export const emptyMySubmissions = (): ApiMySubmissions => ({ tsrs: [], feedback_assignment_ids: [] });

/** Roster alerts for one class the caller created (GET /api/classes/attention-summary). */
export interface ApiClassAttention {
  class_id: string;
  /** When the official roster was uploaded; null if it never was. */
  roster_uploaded_at: string | null;
  /** Students registered on GrepThink who are not on the official roster (TAs excluded). */
  not_on_roster: number;
}

export interface ApiTurnInStats {
  rate: number;
  teamsSubmitted: { count: number; total: number };
  partialSubmissions: { count: number; total: number };
  currentAssignment?: string | null;
  closeDate?: string | null;
}

export interface CreateAssignmentPayload {
  class_id: string;
  title: string;
  open_date: string;
  close_date: string;
  status?: 'draft' | 'publish';
  assignment_type?: string;
}

export interface UpdateAssignmentPayload {
  title?: string;
  open_date?: string;
  close_date?: string;
  status?: 'draft' | 'publish';
  assignment_type?: string;
  /** An ISO instant with its offset (e.g. `date.toISOString()`): the backend reads a value without one as UTC. */
  accept_until?: string;
  clear_accept_until?: boolean;
}

export interface SubmitFeedbackPayload {
  q1_liked: string;
  q2_frustrating: string;
  q3_missing_feature: string;
  q4_bugs: string;
  q5_suggestions: string;
}

export interface ApiFeedbackSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name?: string;
  q1_liked: string;
  q2_frustrating: string;
  q3_missing_feature: string;
  q4_bugs: string;
  q5_suggestions: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApiFeedbackOverview {
  assignment: ApiAssignment;
  submissions: ApiFeedbackSubmission[];
  submitted_count: number;
  total_count: number;
  non_submitters: { id: string; name: string }[];
}

// ----- Messages ------------------------------------------------------------

export type ConversationType = 'dm' | 'team_ta' | 'team_instructor' | 'team_members';

export interface ApiMessageOtherUser {
  id: string;
  email: string | null;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

export interface ApiParticipant {
  id: string;
  role: 'member' | 'ta' | 'instructor';
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  last_read_at?: string | null;
}

export interface ApiMessagePreview {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ApiMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ApiConversationSummary {
  id: string;
  type: ConversationType;
  project_id: string | null;
  team_name: string | null;
  participants: ApiParticipant[];
  /** Populated for type='dm' only. */
  other_user: ApiMessageOtherUser | null;
  last_message: ApiMessagePreview | null;
  unread_count: number;
  other_user_last_read_at: string | null;
  can_send: boolean;
  last_message_at: string | null;
}

export interface ApiContact {
  id: string;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  image_url?: string | null;
  role?: string | null;
}

export interface ApiNotification {
  id: string;
  /** `email_undeliverable`: an invite email failed for good; `entity_id` is the class it was for. */
  type:
    | 'join_request'
    | 'join_rejected'
    | 'message'
    | 'project_created'
    | 'complete_profile'
    | 'upload_roster'
    | 'member_removed'
    | 'email_undeliverable';
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

// ----- Email preferences and unsubscribe -----------------------------------

/** One category of optional email and whether this account gets it (GET /api/email/preferences). */
export interface ApiEmailPreference {
  category: string;
  /** The category's name, e.g. "Deadline reminders". */
  label: string;
  description: string;
  enabled: boolean;
}

/**
 * What an unsubscribe link is for (GET /api/email/unsubscribe): `valid` is false when the backend
 * does not accept the token, and then there is no category.
 */
export interface ApiUnsubscribeInfo {
  valid: boolean;
  category?: string;
  label?: string;
}

/** The category an unsubscribe link just turned off (POST /api/email/unsubscribe). */
export interface ApiUnsubscribeResult {
  unsubscribed: boolean;
  category: string;
  label: string;
}

// ----- Staffing / Interest form -------------------------------------------

export interface ApiStaffingPeer {
  user_id: string;
  name: string | null;
  email: string | null;
}

export interface ApiStaffingRankedProject {
  id?: string;
  user_id?: string;
  class_id?: string;
  project_id: string;
  project_name: string | null;
  interest_value: number;
  interest_reason: string | null;
}

export interface ApiStaffingSubmission {
  user_id: string;
  class_id: string;
  taking_115c: boolean | null;
  previous_project_name: string | null;
  previous_project_link: string | null;
  notes: string | null;
  submitted_at: string | null;
  ranked_projects: ApiStaffingRankedProject[];
  work_with: ApiStaffingPeer[];
  dont_work_with: ApiStaffingPeer[];
}

export interface SubmitInterestFormPayload {
  taking_115c?: boolean | null;
  previous_project_name?: string | null;
  previous_project_link?: string | null;
  notes?: string | null;
  ranked_projects: Array<{
    project_id: string;
    interest_value: number;
    interest_reason?: string | null;
  }>;
  work_with: string[];
  dont_work_with: string[];
  submitted?: boolean;
}

export interface ApiStaffingProjectRank {
  project_id: string;
  project_name: string | null;
  breadth: number;
  depth: number;
  strength: number;
  num_staff: number;
  team_size: number;
  availability: number;
  breadth_rank: number;
  depth_rank: number;
  strength_rank: number;
  sum_of_ranks: number;
  total_rank: number;
}

export interface ApiStaffingAssignmentRow {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  assigned_project_id: string | null;
  assigned_project_name: string | null;
  role: string | null;
}

export interface ApiStaffingStudentAssignedProject {
  project_id: string;
  project_name: string | null;
  role: string | null;
}

export interface ApiStaffingStudent {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  submitted_at: string | null;
  taking_115c: boolean | null;
  previous_project_name: string | null;
  previous_project_link: string | null;
  notes: string | null;
  preferences: Array<{
    project_id: string;
    project_name: string | null;
    interest_value: number;
    interest_reason: string | null;
  }>;
  work_with: ApiStaffingPeer[];
  dont_work_with: ApiStaffingPeer[];
  assigned_project: ApiStaffingStudentAssignedProject | null;
}

export interface ApiStaffingPlacement {
  user_id: string;
  project_id: string;
  project_name: string | null;
  interest_value: number;
}

// ----- Scrum board (app/scrum backend) --------------------------------------

export type ApiEstimateScale = 'linear' | 'exponential' | 'fibonacci';
export type ApiBoardStatus = 'todo' | 'in_progress' | 'done';

export interface ApiScrumMember {
  user_id: string;
  name: string;
  image_url: string | null;
  project_role: string | null;
}

export interface ApiScrumSprint {
  id: string;
  name: string;
  /** ISO date "YYYY-MM-DD". */
  starts_at: string;
  ends_at: string;
  status: 'planned' | 'active' | 'completed';
}

export interface ApiScrumTask {
  id: string;
  story_id: string;
  /** Per-project human key, e.g. "T-12". */
  key: string;
  title: string;
  description_md: string | null;
  points: number | null;
  time_estimate: string | null;
  status: ApiBoardStatus;
  reporter_id: string;
  assignee_id: string | null;
  tags: string[];
  pr_url: string | null;
  pr_provider: string | null;
  pr_state: string | null;
  moved_by: string | null;
  moved_by_name: string | null;
  moved_at: string | null;
  comment_count: number;
}

export interface ApiScrumStory {
  id: string;
  /** null = backlog. */
  sprint_id: string | null;
  /** Per-project human key, e.g. "US-3". */
  key: string;
  title: string;
  description_md: string | null;
  points: number | null;
  time_estimate: string | null;
  reporter_id: string;
  assignee_id: string | null;
  /** Set = story lives in the archive view. */
  archived_at: string | null;
  comment_count: number;
  tasks: ApiScrumTask[];
}

export interface ApiBurnupSeries {
  labels: string[];
  scope: number[];
  completed: number[];
  subtitle: string | null;
}

export interface ApiScrumBoard {
  project: { id: string; name: string; estimate_scale: ApiEstimateScale };
  ai_enabled: boolean;
  sprints: ApiScrumSprint[];
  /** Sprint being viewed (null = no sprints yet / backlog only). */
  sprint_id: string | null;
  stories: ApiScrumStory[];
  backlog: ApiScrumStory[];
  burnup: { sprint: ApiBurnupSeries | null; cumulative: ApiBurnupSeries };
  members: ApiScrumMember[];
  /** 'member' = full read/write; 'staff' = read + comments. */
  access: 'member' | 'staff';
}

export interface ApiScrumComment {
  id: string;
  author_id: string;
  author_name: string;
  body_md: string;
  created_at: string;
}

export interface ApiAiDraftTask {
  title: string;
  tags: string[];
  points: number | null;
  time_estimate: string | null;
}

export interface ApiAiDraft {
  title: string | null;
  description_md: string | null;
  points: number | null;
  time_estimate: string | null;
  tasks: ApiAiDraftTask[];
}

export interface ApiScrumRepo {
  id: string;
  repo_url: string;
  provider: 'github' | 'gitlab';
  has_token: boolean;   // tokens are write-only; the API never returns them
}

export type ApiUpdateSprintBody = Partial<
  Pick<ApiScrumSprint, 'name' | 'starts_at' | 'ends_at' | 'status'>
>;

export interface ApiCreateStoryBody {
  title: string;
  description_md?: string;
  points?: number;
  time_estimate?: string;
  assignee_id?: string;
  /** Omit for backlog. */
  sprint_id?: string;
}

export interface ApiUpdateStoryBody {
  title?: string;
  /** Explicit null clears it (an omitted key leaves it as it is). */
  description_md?: string | null;
  points?: number;
  time_estimate?: string;
  assignee_id?: string;
  /** Explicit null moves the story to the backlog. */
  sprint_id?: string | null;
  /** true sets archived_at, false clears it. */
  archived?: boolean;
}

export interface ApiCreateTaskBody {
  title: string;
  description_md?: string;
  points?: number;
  time_estimate?: string;
  assignee_id?: string;
  tags?: string[];
}

export interface ApiUpdateTaskBody {
  title?: string;
  /** Explicit null clears it (an omitted key leaves it as it is). */
  description_md?: string | null;
  points?: number;
  time_estimate?: string | null;
  assignee_id?: string | null;
  tags?: string[];
  /** Explicit null unlinks the PR. */
  pr_url?: string | null;
}

// ── Analytics (spec §6.3; handoff brief §5 is the contract) ───────────────────────────────────────
export type AnalyticsRangePreset = '7d' | '30d' | '90d' | 'class' | 'all' | 'custom';
export type AnalyticsBoardStatus = 'todo' | 'in_progress' | 'done';
export type AnalyticsTimelinessBucket = 'early' | 'on_time' | 'late' | 'missing' | 'not_due';
/** A client-side toggle on the scrum card, never a request parameter. */
export type AnalyticsUnit = 'count' | 'points';

export interface ApiAnalyticsScopeClass {
  id: string;
  name: string;
  term: string | null;
  start_date: string | null;
  /** "CSE 115A · Fall 2026" — the name, and the term when there is one. */
  label: string;
}
export interface ApiAnalyticsScopeInstitution {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  access: 'maintainer' | 'instructor';
  classes: ApiAnalyticsScopeClass[];
}
export interface ApiAnalyticsScope {
  institutions: ApiAnalyticsScopeInstitution[];
}

export interface ApiAnalyticsOverview {
  active_classes: number | null;
  teams: number | null;
  students: number | null;
  active_users_7d: number | null;
  messages: number | null;
  stories_created: number | null;
  tasks_created: number | null;
  story_points_created: number | null;
  task_points_created: number | null;
  on_time_rate: number | null;
  /** `team_messages` (team channels only) is the class view's Messages tile; `messages` adds the school-wide DMs. */
  deltas: Partial<Record<'messages' | 'team_messages' | 'stories_created' | 'tasks_created' | 'on_time_rate' | 'active_users_7d', number | null>>;
  /** Weekly totals of complete weeks from the nightly rollup, oldest first, up to 12 points; absent before the first rollup. */
  trends: Partial<Record<'messages' | 'team_messages' | 'tasks_created', number[]>>;
}
export interface ApiAnalyticsConversations {
  total: number | null;
  team_members: number | null;
  dm: number | null;
  weekly: { week_start: string; team_members: number; dm: number }[];
  excluded: string[];
}
export interface ApiAnalyticsSprintRow {
  ordinal: number;
  label: string;
  teams: number;
  todo: number;
  in_progress: number;
  done: number;
  points_todo: number;
  points_in_progress: number;
  points_done: number;
}
export interface ApiAnalyticsScrum {
  live_as_of: string;
  stories_created: number | null;
  tasks_created: number | null;
  story_points_created: number | null;
  task_points_created: number | null;
  by_sprint: ApiAnalyticsSprintRow[];
  chars: { entity: 'task' | 'story'; ordinal: number | null; label: string; n: number; median: number }[];
}
export interface ApiAnalyticsTimeliness {
  on_time_rate: number | null;
  expected: number;
  late: number;
  missing: number;
  edited_late: number;
  bucket_order: AnalyticsTimelinessBucket[];
  rows: unknown[];
}
export interface ApiAnalyticsTrendPanel {
  key: 'team_messages_per_team' | 'tasks_per_team' | 'points_done_per_team' | 'on_time_rate';
  title: string;
  unit: string;
  current: { week_start: string; value: number | null }[];
  previous: { week_start: string; value: number | null }[] | null;
}
export interface ApiAnalyticsTrends {
  as_of: string | null;
  panels: ApiAnalyticsTrendPanel[];
}
export interface ApiAnalyticsBreakdownRow {
  id: string;
  name: string;
  kind: 'row' | 'folded';
  teams?: number | null;
  students?: number | null;
  members?: number | null;
  team_messages: number | null;
  stories: number | null;
  tasks: number | null;
  points_done_rate: number | null;
  on_time_rate: number | null;
  missing: number;
  href?: string | null;
}
export interface ApiAnalyticsBreakdown {
  kind: 'class' | 'team';
  rows: ApiAnalyticsBreakdownRow[];
}
export type AnalyticsSection = 'overview' | 'conversations' | 'scrum' | 'timeliness' | 'trends' | 'breakdown';
export interface ApiAnalyticsDashboard {
  meta: {
    institution: { id: string; name: string; slug: string; timezone: string };
    class: { id: string; label: string } | null;
    range: { preset: AnalyticsRangePreset; from: string; to: string; previous_from: string | null; previous_to: string | null };
    generated_at: string;
    cached: boolean;
    k_anonymity: number;
    rollup_as_of: string | null;
  };
  overview: ApiAnalyticsOverview;
  conversations: ApiAnalyticsConversations;
  scrum: ApiAnalyticsScrum;
  timeliness: ApiAnalyticsTimeliness;
  trends: ApiAnalyticsTrends;
  breakdown: ApiAnalyticsBreakdown;
  failures: AnalyticsSection[];
}
export interface AnalyticsDashboardQuery {
  institution_id: string;
  class_id?: string | null;
  window: AnalyticsRangePreset;
  /** ISO dates, only sent with `window: 'custom'`. */
  from?: string | null;
  to?: string | null;
  fresh?: boolean;
}
