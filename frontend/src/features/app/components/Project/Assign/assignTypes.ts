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
