export type InterestTab = 'projects' | 'team' | 'about';

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

export const MOCK_PROJECTS: MockProject[] = [
  { id: 'p1',  name: 'ShoeShopper',       description: 'E-commerce platform for specialty footwear' },
  { id: 'p2',  name: 'Chatcut',            description: 'AI-powered conversation analytics dashboard' },
  { id: 'p3',  name: 'TaskMaster',         description: 'Agile project management tool for small teams' },
  { id: 'p4',  name: 'EcoTrack',           description: 'Carbon footprint tracker for university campuses' },
  { id: 'p5',  name: 'MedConnect',         description: 'Telemedicine scheduling & patient portal' },
  { id: 'p6',  name: 'StudySync',          description: 'Collaborative study session planner' },
  { id: 'p7',  name: 'CampusEats',         description: 'Student meal-swap and dining marketplace' },
  { id: 'p8',  name: 'RideShare UCSC',     description: 'Carpooling app for university commuters' },
  { id: 'p9',  name: 'PetPal',             description: 'Pet adoption and foster care matching platform' },
  { id: 'p10', name: 'GreenRoute',         description: 'Sustainable travel planner with emissions data' },
  { id: 'p11', name: 'TutorLink',          description: 'Peer tutoring marketplace for undergrads' },
  { id: 'p12', name: 'EventHive',          description: 'Campus event discovery and RSVP system' },
];

export const MOCK_STUDENTS: MockStudent[] = [
  { id: 's1',  name: 'Alex Johnson',    email: 'alex.johnson@ucsc.edu' },
  { id: 's2',  name: 'Priya Patel',     email: 'priya.patel@ucsc.edu' },
  { id: 's3',  name: 'Marcus Williams', email: 'marcus.williams@ucsc.edu' },
  { id: 's4',  name: 'Sofia Chen',      email: 'sofia.chen@ucsc.edu' },
  { id: 's5',  name: 'James Rodriguez', email: 'james.rodriguez@ucsc.edu' },
  { id: 's6',  name: 'Emily Tran',      email: 'emily.tran@ucsc.edu' },
  { id: 's7',  name: 'Noah Kim',        email: 'noah.kim@ucsc.edu' },
  { id: 's8',  name: 'Aisha Okonkwo',   email: 'aisha.okonkwo@ucsc.edu' },
  { id: 's9',  name: 'Liam Nguyen',     email: 'liam.nguyen@ucsc.edu' },
  { id: 's10', name: 'Chloe Martinez',  email: 'chloe.martinez@ucsc.edu' },
  { id: 's11', name: 'Ethan Brooks',    email: 'ethan.brooks@ucsc.edu' },
  { id: 's12', name: 'Fatima Hassan',   email: 'fatima.hassan@ucsc.edu' },
];
