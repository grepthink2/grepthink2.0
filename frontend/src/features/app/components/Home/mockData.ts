/** Mock-only data for the student home (no backend for schedule / demo requests). */

export interface MockScheduleItem {
  id: string;
  timeLabel: string;
  title: string;
  subtitle: string;
  /** 'green' | 'blue' | 'orange' — timeline dot color */
  accent: 'green' | 'blue' | 'orange';
}

export interface MockRequestBadge {
  label: string;
  variant: 'neutral' | 'purple';
}

export interface MockJoinRequest {
  id: string;
  projectName: string;
  avatarInitials: string;
  avatarBg: string;
  subtext: string;
  badges: MockRequestBadge[];
  /** When set, show awaiting footer instead of action buttons */
  awaitingMeta?: string;
}

// export const MOCK_SCHEDULE: MockScheduleItem[] = [
//   {
//     id: 's1',
//     timeLabel: '10:00 AM',
//     title: 'Team standup',
//     subtitle: 'CSE 115B - Zoom',
//     accent: 'green',
//   },
//   {
//     id: 's2',
//     timeLabel: '1:30 PM',
//     title: 'CSE 115B lecture',
//     subtitle: 'Engineering 2, Room 192',
//     accent: 'blue',
//   },
//   {
//     id: 's3',
//     timeLabel: '4:00 PM',
//     title: 'Project office hours',
//     subtitle: 'Jack Baskin 105',
//     accent: 'orange',
//   },
// ];

/** Demo outgoing join requests (no list-my-requests API yet). */
export const MOCK_OUTGOING_JOIN_REQUESTS: MockJoinRequest[] = [
  {
    id: 'out-r1',
    projectName: 'Anylog',
    avatarInitials: 'A',
    // Predates the --gt-* design-token system; a demo-fixture avatar color,
    // left as-is rather than churned as a side effect of wiring the
    // adherence lint.
    avatarBg: '#2771FF',
    subtext: '2026 CSE 115B',
    badges: [
      { label: '5 Members', variant: 'neutral' },
      { label: 'Company Sponsored', variant: 'neutral' },
      { label: 'Outgoing', variant: 'purple' },
    ],
    awaitingMeta: 'Awaiting Response • Just 2 days ago',
  },
];
