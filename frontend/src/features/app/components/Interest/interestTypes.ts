export interface MockProject {
  id: string;
  name: string;
  description?: string;
}

export interface MockStudent {
  id: string;
  name: string;
  email?: string;
}

export interface ProjectChoice {
  projectId: string;
  projectName: string;
  reasoning: string;
}

/** Exactly 5 ranked slots; null means the slot is empty. */
export type ProjectSlots = [
  ProjectChoice | null,
  ProjectChoice | null,
  ProjectChoice | null,
  ProjectChoice | null,
  ProjectChoice | null,
];

export interface InterestFormState {
  projectSlots: ProjectSlots;
  previousProject: string;
  previousProjectLink: string;
  taking115c: boolean | null;
  workWith: MockStudent[];
  dontWorkWith: MockStudent[];
  notes: string;
}

export interface InterestFormAssignment {
  id: string;
  name: string;
  dueDate?: string;
  classId?: string;
}
