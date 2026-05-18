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

export const MOCK_ROSTER: UiStudent[] = [
  {
    id: '1',
    name: 'Alice Chen',
    email: 'achen@ucsc.edu',
    classStatus: 'enrolled',
    grepthinkStatus: 'registered',
    projects: ['ShoeShopper'],
  },
  {
    id: '2',
    name: 'Bob Martinez',
    email: 'bmartinez@ucsc.edu',
    classStatus: 'enrolled',
    grepthinkStatus: 'not_registered',
    projects: [],
  },
  {
    id: '3',
    name: 'Carol Kim',
    email: 'ckim@ucsc.edu',
    classStatus: 'waitlisted',
    grepthinkStatus: 'registered',
    projects: ['Chatcut'],
  },
  {
    id: '4',
    name: 'David Lee',
    email: 'dlee@ucsc.edu',
    classStatus: 'waitlisted',
    grepthinkStatus: 'not_registered',
    projects: [],
  },
  {
    id: '5',
    name: 'Emma Torres',
    email: 'etorres@ucsc.edu',
    classStatus: 'enrolled',
    grepthinkStatus: 'registered',
    projects: ['TaskMaster', 'ShoeShopper'],
  },
  {
    id: '6',
    name: 'Frank Nguyen',
    email: 'fnguyen@ucsc.edu',
    classStatus: 'dropped',
    grepthinkStatus: 'registered',
    projects: ['TaskMaster'],
  },
  {
    id: '7',
    name: 'Grace Park',
    email: 'gpark@ucsc.edu',
    classStatus: 'dropped',
    grepthinkStatus: 'not_registered',
    projects: [],
  },
  {
    id: '8',
    name: 'Henry Brown',
    email: 'hbrown@ucsc.edu',
    classStatus: 'not_on_roster',
    grepthinkStatus: 'registered',
    projects: ['ShoeShopper'],
  },
  {
    id: '9',
    name: 'Isabella White',
    email: 'iwhite@ucsc.edu',
    classStatus: 'enrolled',
    grepthinkStatus: 'registered',
    projects: ['Chatcut'],
  },
  {
    id: '10',
    name: 'James Wilson',
    email: 'jwilson@ucsc.edu',
    classStatus: 'enrolled',
    grepthinkStatus: 'not_registered',
    projects: [],
  },
  {
    id: '11',
    name: 'Katie Zhang',
    email: 'kzhang@ucsc.edu',
    classStatus: 'enrolled',
    grepthinkStatus: 'registered',
    projects: ['TaskMaster'],
  },
  {
    id: '12',
    name: 'Liam Johnson',
    email: 'ljohnson@ucsc.edu',
    classStatus: 'waitlisted',
    grepthinkStatus: 'registered',
    projects: [],
  },
];
