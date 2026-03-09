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
