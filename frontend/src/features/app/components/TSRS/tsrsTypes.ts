export interface TeamMember {
  id: string;
  name: string;
  role: string;
  isCurrentUser: boolean;
  isScrumMaster: boolean;
}

export interface TsrsAssignment {
  id: string;
  name: string;
  dueDate: string;
  projectName: string;
  projectId: string;
  /** The deadline instant from the backend; null or missing when not known. */
  dueAt?: string | null;
  /** The open date (YYYY-MM-DD); null or missing when not known. */
  openDate?: string | null;
  /** The late window's end from the backend; null or missing when there is none or it is not known. */
  acceptUntil?: string | null;
}

export type TsrsTab = 'contributions' | 'team_feedback' | 'scrum_master';

export interface ContributionMap {
  [memberId: string]: number;
}

export interface FeedbackEntry {
  contribution: string;
  improvement: string;
}

export interface ScrumMasterEntry {
  tickets: string;
  assessment: string;
  notes: string;
}
