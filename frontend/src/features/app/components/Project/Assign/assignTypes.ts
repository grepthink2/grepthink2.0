export type StudentViewMode = 'list' | 'graph';

export interface ProjectPreference {
  projectId: string;
  projectName: string;
  rating: number; // 1-5
  reason: string;
}

export interface StudentInterest {
  /** Strength of interest in the currently-focused project (1-5). */
  forFocusedProject: number;
  /** Number of remaining projects the student has interest in that still have open seats. */
  availableMatches: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  interest: StudentInterest;
  notes?: string;
  previousProjectName?: string;
  previousProjectId?: string;
  takingCS115C: boolean;
  preferences: ProjectPreference[];
  /** Other student IDs that submitted this student as their group leader. */
  teammateIds?: string[];
}

export interface AssignProject {
  id: string;
  name: string;
  sponsor: string;
  popularity: number; // 0-5, one decimal
  seatsTaken: number;
  totalSeats: number;
}

export interface AssignSummary {
  studentsUnassigned: number;
  availableSeats: number;
  /** Number of projects that still have at least one open seat. */
  projectsRemaining: number;
  projectsTotal: number;
}

/** Project augmented with interest metrics used in the Staffing step. */
export interface StaffingProject extends AssignProject {
  /** Number of students who expressed any interest in this project. */
  breadth: number;
  /** Sum of all interest ratings (1–5) for this project. */
  depth: number;
}

/** `StaffingProject` with computed ranks (derived, never stored). */
export interface RankedStaffingProject extends StaffingProject {
  /** depth / breadth — average interest intensity. */
  strength: number;
  /** Rank by breadth (1 = most interested students). */
  bRank: number;
  /** Rank by depth (1 = highest cumulative interest). */
  dRank: number;
  /** Rank by strength (1 = highest average intensity). */
  sRank: number;
  /** bRank + dRank + sRank. */
  sumRanks: number;
  /** Rank by sumRanks (1 = overall most desirable). */
  totalRank: number;
}

export type StaffingSortKey = 'name' | 'seats' | 'breadth' | 'depth' | 'strength' | 'bRank' | 'dRank' | 'sRank' | 'sumRanks' | 'totalRank';
export type SortDir = 'asc' | 'desc';
