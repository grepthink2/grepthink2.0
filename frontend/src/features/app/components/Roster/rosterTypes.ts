import type { ApiRosterStudent } from '@/lib/api';

export type ClassStatus = 'enrolled' | 'waitlisted' | 'dropped' | 'not_on_roster';
export type GrepthinkStatus = 'registered' | 'not_registered';

export type FilterOption =
  | 'all'
  | 'not_registered'
  | 'waitlisted_in_grepthink'
  | 'waitlisted_not_registered'
  | 'dropped_in_grepthink'
  | 'dropped_not_registered'
  | 'not_on_roster';

export interface UiStudent {
  id: string;
  name: string;
  email: string;
  classStatus: ClassStatus;
  grepthinkStatus: GrepthinkStatus;
  isTa: boolean;
  projects: string[];
}

export const FILTER_LABELS: Record<FilterOption, string> = {
  all: 'All Students',
  not_registered: 'Not Registered',
  waitlisted_in_grepthink: 'Waitlisted – In GrepThink',
  waitlisted_not_registered: 'Waitlisted – Not Registered',
  dropped_in_grepthink: 'Dropped – In GrepThink',
  dropped_not_registered: 'Dropped – Not Registered',
  not_on_roster: 'Not On Roster',
};

export function mapApiRosterStudent(student: ApiRosterStudent): UiStudent {
  return {
    id: student.id,
    name: student.name,
    email: student.email,
    classStatus: student.class_status,
    grepthinkStatus: student.grepthink_status,
    isTa: student.enrollment_role === 'ta',
    projects: student.projects,
  };
}

/**
 * Students that count toward class statistics. TAs are overseers, not part of
 * the student population, so they're excluded from every count and chart.
 */
export function countableStudents(students: UiStudent[]): UiStudent[] {
  return students.filter((s) => !s.isTa);
}

/** Not on GrepThink yet and not dropped from the official roster, excluding TAs. */
export function isBulkInviteCandidate(student: UiStudent): boolean {
  return (
    !student.isTa &&
    student.grepthinkStatus === 'not_registered' &&
    student.classStatus !== 'dropped'
  );
}

export function applyFilter(students: UiStudent[], filter: FilterOption): UiStudent[] {
  switch (filter) {
    case 'all':
      return students;
    case 'not_registered':
      return students.filter((s) => s.grepthinkStatus === 'not_registered');
    case 'waitlisted_in_grepthink':
      return students.filter(
        (s) => s.classStatus === 'waitlisted' && s.grepthinkStatus === 'registered',
      );
    case 'waitlisted_not_registered':
      return students.filter(
        (s) => s.classStatus === 'waitlisted' && s.grepthinkStatus === 'not_registered',
      );
    case 'dropped_in_grepthink':
      return students.filter(
        (s) => s.classStatus === 'dropped' && s.grepthinkStatus === 'registered',
      );
    case 'dropped_not_registered':
      return students.filter(
        (s) => s.classStatus === 'dropped' && s.grepthinkStatus === 'not_registered',
      );
    case 'not_on_roster':
      return students.filter((s) => s.classStatus === 'not_on_roster');
  }
}
