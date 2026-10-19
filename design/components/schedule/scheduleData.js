/* GrepThink schedule — sample items for the design kit (throwaway; the data layer owns the real shape).
   All times authored in campus time (PT) and stored as UTC ISO. window.GT_SCHEDULE_SAMPLE */
(function () {
  // PDT (-07:00) until Nov 1 2026, PST (-08:00) after.
  const at = (day, hm) => new Date(`${day}T${hm}:00${day >= '2026-11-01' ? '-08:00' : '-07:00'}`).toISOString();
  const Z = { team1: 'https://ucsc.zoom.us/j/93312007451', team4: 'https://ucsc.zoom.us/j/95520018812', team6: 'https://ucsc.zoom.us/j/91877402133', review: 'https://ucsc.zoom.us/j/98001133770', staff: 'https://ucsc.zoom.us/j/92210007788', oh: 'https://ucsc.zoom.us/j/97120033401' };
  const PRIYA = { id: 'u-priya', name: 'Priya Kapoor', role: 'TA' };
  const MARCUS = { id: 'u-marcus', name: 'Marcus Lee', role: 'TA' };
  const DANA = { id: 'u-dana', name: 'Dana Whitfield', role: 'TA' };
  const PROF = { id: 'u-jullig', name: 'Prof. Jullig', role: 'Instructor' };
  const ASHTON = { id: 'u-ashton', name: 'Ashton Liu', role: 'Scrum Master' };
  const C115B = { classId: 'c115b', classLabel: 'CSE 115B' };
  const C115A = { classId: 'c115a', classLabel: 'CSE 115A' };
  const TEAM1 = ['Ashton Liu', 'Tony Wang', 'Landon Nguyen', 'Joshua Cruz'];

  const lecture = (id, day, cls, extra) => ({ id, kind: 'lecture', title: 'Lecture', startsAt: at(day, cls === C115A ? '09:50' : '13:20'), endsAt: at(day, cls === C115A ? '10:55' : '14:25'), location: cls === C115A ? 'Thimann Lecture Hall 3' : 'Engineering 2, Room 192', recurrenceLabel: cls === C115A ? 'Tue & Thu' : 'Mon · Wed · Fri', ...cls, ...extra });
  const taMeeting = (id, day, hm, team, extra) => {
    const [h, m] = hm.split(':').map(Number); const end = `${String(h).padStart(2, '0')}:${String(m + 45).padStart(2, '0')}`;
    return { id, kind: 'ta_meeting', title: 'TA meeting', startsAt: at(day, hm), endsAt: at(day, end), teamName: team, ...C115B, meetingsPerWeek: 2, ...extra };
  };
  const sprint = (id, day, name, edge) => ({ id, kind: 'sprint', title: name, startsAt: at(day, '00:00'), allDay: true, sprint: { name, edge } });
  const deadline = (id, day, title, cls = C115B) => ({ id, kind: 'deadline', title, startsAt: at(day, '23:59'), endsAt: null, href: '/app/assignments', ...cls });

  /* ── Student: Joshua Cruz · Team 1 · CSE 115B · TA Priya Kapoor ─────────────── */
  const student = [
    // last week
    lecture('s-l1', '2026-10-12', C115B), lecture('s-l2', '2026-10-14', C115B), lecture('s-l3', '2026-10-16', C115B),
    taMeeting('s-m1', '2026-10-12', '15:00', 'Team 1', { host: PRIYA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendance: 'late', attendees: TEAM1 }),
    taMeeting('s-m2', '2026-10-13', '15:00', 'Team 1', { host: PRIYA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendance: 'absent', attendees: TEAM1 }),
    deadline('s-d0', '2026-10-13', 'TSR 3 due'),
    // this week (Mon Oct 19 – Sun Oct 25)
    lecture('s-l4', '2026-10-19', C115B),
    taMeeting('s-m3', '2026-10-19', '15:00', 'Team 1', { host: PRIYA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendance: 'present', attendees: TEAM1 }),
    sprint('s-sp1', '2026-10-20', 'Sprint 2', 'end'),
    { id: 's-oh1', kind: 'office_hours', title: 'Office hours', startsAt: at('2026-10-20', '10:00'), endsAt: at('2026-10-20', '10:50'), host: PRIYA, location: 'Baskin Engineering 105', recurrenceLabel: 'Weekly · Tue', ...C115B },
    { id: 's-mt1', kind: 'meeting', title: 'Sprint 3 planning', startsAt: at('2026-10-20', '13:00'), endsAt: at('2026-10-20', '13:30'), teamName: 'Team 1', scope: 'team', host: ASHTON, zoomUrl: Z.team1, note: 'Bring your estimates for the top 10 backlog stories.', ...C115B },
    taMeeting('s-m4', '2026-10-20', '15:00', 'Team 1', { host: PRIYA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendance: 'present', attendees: TEAM1 }),
    { id: 's-oh2', kind: 'office_hours', title: 'Office hours', startsAt: at('2026-10-20', '15:30'), endsAt: at('2026-10-20', '16:30'), host: PROF, zoomUrl: Z.oh, recurrenceLabel: 'Weekly · Tue', ...C115B },
    deadline('s-d1', '2026-10-20', 'TSR 4 due'),
    sprint('s-sp2', '2026-10-21', 'Sprint 3', 'start'),
    lecture('s-l5', '2026-10-21', C115B),
    { id: 's-mt2', kind: 'meeting', title: 'Team 1 retro', startsAt: at('2026-10-22', '00:00'), endsAt: null, status: 'tbd', teamName: 'Team 1', scope: 'team', host: ASHTON, zoomUrl: Z.team1, ...C115B },
    { id: 's-ad1', kind: 'deadline', title: 'Peer eval window opens', startsAt: at('2026-10-22', '00:00'), allDay: true, ...C115B },
    lecture('s-l6', '2026-10-23', C115B, { status: 'cancelled', cancelReason: 'Cancelled · instructor at a conference — the recorded lecture is on Canvas.' }),
    { id: 's-fr1', kind: 'final_review', title: 'Final review', startsAt: at('2026-10-23', '14:40'), endsAt: at('2026-10-23', '15:00'), teamName: 'Team 1', zoomUrl: Z.review, reviewers: [{ ...PRIYA, slot: 'home' }, { ...MARCUS, slot: 'review' }], ...C115B },
    // next week
    lecture('s-l7', '2026-10-26', C115B), lecture('s-l8', '2026-10-28', C115B), lecture('s-l9', '2026-10-30', C115B),
    taMeeting('s-m5', '2026-10-26', '15:00', 'Team 1', { host: PRIYA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendees: TEAM1 }),
    { id: 's-oh3', kind: 'office_hours', title: 'Office hours', startsAt: at('2026-10-27', '10:00'), endsAt: at('2026-10-27', '10:50'), host: PRIYA, location: 'Baskin Engineering 105', recurrenceLabel: 'Weekly · Tue', ...C115B },
    taMeeting('s-m6', '2026-10-27', '15:00', 'Team 1', { host: PRIYA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendees: TEAM1 }),
    deadline('s-d2', '2026-10-27', 'TSR 5 due'),
    // week after
    sprint('s-sp3', '2026-11-03', 'Sprint 3', 'end'),
    lecture('s-l10', '2026-11-02', C115B),
    taMeeting('s-m7', '2026-11-02', '15:00', 'Team 1', { host: PRIYA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendees: TEAM1 }),
  ];

  /* ── TA: Priya Kapoor · Teams 1, 4, 6 (CSE 115B) + Team 2 (CSE 115A) ─────────── */
  const YOU_TA = { ...PRIYA, you: true };
  const T4 = ['Mina Park', 'Devon Reyes', 'Sam Okafor', 'Lily Chen', 'Omar Haddad'];
  const T6 = ['Grace Kim', 'Theo Marsh', 'Ivy Rao', 'Noah Bell'];
  const ta = [
    taMeeting('t-m1', '2026-10-19', '14:00', 'Team 1', { host: YOU_TA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendance: { present: 3, total: 4 }, attendees: TEAM1 }),
    taMeeting('t-m2', '2026-10-19', '15:00', 'Team 4', { host: YOU_TA, zoomUrl: Z.team4, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendance: { present: 5, total: 5 }, attendees: T4 }),
    taMeeting('t-m3', '2026-10-19', '16:00', 'Team 6', { host: YOU_TA, zoomUrl: Z.team6, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendance: { present: 2, total: 4 }, attendees: T6 }),
    sprint('t-sp1', '2026-10-20', 'Sprint 2 · Team 1', 'end'),
    { id: 't-oh1', kind: 'office_hours', title: 'Office hours', startsAt: at('2026-10-20', '10:00'), endsAt: at('2026-10-20', '10:50'), host: YOU_TA, location: 'Baskin Engineering 105', recurrenceLabel: 'Weekly · Tue', ...C115B },
    taMeeting('t-m4', '2026-10-20', '14:00', 'Team 1', { host: YOU_TA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendance: { present: 4, total: 4 }, attendees: TEAM1 }),
    taMeeting('t-m5', '2026-10-20', '15:00', 'Team 4', { host: YOU_TA, zoomUrl: Z.team4, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendance: { present: 3, total: 5 }, attendees: T4 }),
    taMeeting('t-m6', '2026-10-20', '16:00', 'Team 6', { host: YOU_TA, zoomUrl: Z.team6, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendance: { present: 0, total: 4 }, attendees: T6 }),
    { id: 't-m7', kind: 'ta_meeting', title: 'TA meeting', startsAt: at('2026-10-20', '00:00'), endsAt: null, status: 'tbd', teamName: 'Team 9', host: YOU_TA, recurrenceLabel: 'Weekly · Tue', meetingsPerWeek: 2, meetingIndex: 2, ...C115B },
    deadline('t-d1', '2026-10-20', 'TSR 4 due'),
    sprint('t-sp2', '2026-10-21', 'Sprint 3 · Team 1', 'start'),
    taMeeting('t-m8', '2026-10-21', '13:00', 'Team 2', { host: YOU_TA, zoomUrl: Z.staff, recurrenceLabel: 'Weekly · Wed', meetingsPerWeek: 1, attendees: ['Ana Sousa', 'Ben Ito', 'Chloe Adams'], ...C115A }),
    { id: 't-mt1', kind: 'meeting', title: 'TA sync', startsAt: at('2026-10-22', '11:00'), endsAt: at('2026-10-22', '11:30'), host: PROF, zoomUrl: Z.staff, status: 'cancelled', cancelReason: 'Cancelled · moved to next Thursday.', ...C115B },
    { id: 't-ad1', kind: 'deadline', title: 'Peer eval window opens', startsAt: at('2026-10-22', '00:00'), allDay: true, ...C115B },
    { id: 't-fr1', kind: 'final_review', title: 'Final review', startsAt: at('2026-10-23', '14:40'), endsAt: at('2026-10-23', '15:00'), teamName: 'Team 1', zoomUrl: Z.review, reviewers: [{ ...YOU_TA, slot: 'home' }, { ...MARCUS, slot: 'review' }], ...C115B },
    { id: 't-fr2', kind: 'final_review', title: 'Final review', startsAt: at('2026-10-23', '15:00'), endsAt: at('2026-10-23', '15:20'), teamName: 'Team 7', zoomUrl: Z.review, reviewers: [{ ...MARCUS, slot: 'home' }, { ...YOU_TA, slot: 'review' }], ...C115B },
    taMeeting('t-m9', '2026-10-26', '14:00', 'Team 1', { host: YOU_TA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendees: TEAM1 }),
    taMeeting('t-m10', '2026-10-26', '15:00', 'Team 4', { host: YOU_TA, zoomUrl: Z.team4, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendees: T4 }),
    taMeeting('t-m11', '2026-10-26', '16:00', 'Team 6', { host: YOU_TA, zoomUrl: Z.team6, recurrenceLabel: 'Weekly · Mon', meetingIndex: 1, attendees: T6 }),
    { id: 't-oh2', kind: 'office_hours', title: 'Office hours', startsAt: at('2026-10-27', '10:00'), endsAt: at('2026-10-27', '10:50'), host: YOU_TA, location: 'Baskin Engineering 105', recurrenceLabel: 'Weekly · Tue', ...C115B },
    deadline('t-d2', '2026-10-27', 'TSR 5 due'),
  ];

  /* ── Instructor: Prof. Jullig · CSE 115B + CSE 115A ───────────────────────────── */
  const YOU_PROF = { ...PROF, you: true };
  const fr = (id, hm, team, home, review) => { const [h, m] = hm.split(':').map(Number); const end = `${String(h + Math.floor((m + 20) / 60)).padStart(2, '0')}:${String((m + 20) % 60).padStart(2, '0')}`; return { id, kind: 'final_review', title: 'Final review', startsAt: at('2026-10-23', hm), endsAt: at('2026-10-23', end), teamName: team, zoomUrl: Z.review, reviewers: [{ ...home, slot: 'home' }, { ...review, slot: 'review' }], ...C115B }; };
  const instructor = [
    lecture('i-l1', '2026-10-19', C115B), lecture('i-l0', '2026-10-20', C115A), lecture('i-l2', '2026-10-21', C115B), lecture('i-l3', '2026-10-22', C115A),
    lecture('i-l4', '2026-10-23', C115B, { status: 'cancelled', cancelReason: 'Cancelled · at a conference — recorded lecture posted to Canvas.' }),
    taMeeting('i-m1', '2026-10-20', '14:00', 'Team 1', { host: PRIYA, zoomUrl: Z.team1, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendance: { present: 4, total: 4 }, attendees: TEAM1 }),
    taMeeting('i-m2', '2026-10-20', '15:00', 'Team 4', { host: PRIYA, zoomUrl: Z.team4, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendance: { present: 3, total: 5 }, attendees: T4 }),
    taMeeting('i-m3', '2026-10-20', '15:00', 'Team 3', { host: MARCUS, zoomUrl: Z.staff, recurrenceLabel: 'Weekly · Tue', meetingIndex: 2, attendance: { present: 0, total: 4 }, attendees: ['Rin Sato', 'Eli Brooks', 'Maya Patel', 'Jon Reed'] }),
    { id: 'i-oh1', kind: 'office_hours', title: 'Office hours', startsAt: at('2026-10-20', '15:30'), endsAt: at('2026-10-20', '16:30'), host: YOU_PROF, zoomUrl: Z.oh, recurrenceLabel: 'Weekly · Tue', ...C115B },
    deadline('i-d1', '2026-10-20', 'TSR 4 due'),
    { id: 'i-mt1', kind: 'meeting', title: 'TA sync', startsAt: at('2026-10-22', '11:00'), endsAt: at('2026-10-22', '11:30'), host: YOU_PROF, zoomUrl: Z.staff, note: 'Final-review pairings and the TSR 4 grading rubric.', ...C115B },
    { id: 'i-mt2', kind: 'meeting', title: 'Industry panel', startsAt: at('2026-10-22', '17:00'), endsAt: at('2026-10-22', '18:00'), scope: 'class', host: YOU_PROF, location: 'Media Theater M110', note: 'Guests from two sponsor companies; attendance counts toward participation.', ...C115B },
    { id: 'i-ad1', kind: 'deadline', title: 'Peer eval window opens', startsAt: at('2026-10-22', '00:00'), allDay: true, ...C115B },
    fr('i-fr1', '14:00', 'Team 3', MARCUS, DANA), fr('i-fr2', '14:20', 'Team 5', DANA, PRIYA), fr('i-fr3', '14:40', 'Team 1', PRIYA, MARCUS), fr('i-fr4', '15:00', 'Team 7', MARCUS, PRIYA),
    { id: 'i-mt3', kind: 'meeting', title: 'Sponsor check-in · Team 5', startsAt: at('2026-10-21', '00:00'), endsAt: null, status: 'tbd', teamName: 'Team 5', scope: 'team', host: YOU_PROF, zoomUrl: Z.staff, ...C115B },
    lecture('i-l5', '2026-10-26', C115B), lecture('i-l6', '2026-10-27', C115A), lecture('i-l7', '2026-10-28', C115B),
    { id: 'i-oh2', kind: 'office_hours', title: 'Office hours', startsAt: at('2026-10-27', '15:30'), endsAt: at('2026-10-27', '16:30'), host: YOU_PROF, zoomUrl: Z.oh, recurrenceLabel: 'Weekly · Tue', ...C115B },
    deadline('i-d2', '2026-10-27', 'TSR 5 due'),
  ];

  window.GT_SCHEDULE_SAMPLE = {
    student, ta, instructor,
    classes: [{ id: 'c115b', label: 'CSE 115B' }, { id: 'c115a', label: 'CSE 115A' }],
    nows: { live: at('2026-10-20', '15:12'), morning: at('2026-10-20', '09:00'), evening: at('2026-10-20', '20:30'), quiet: at('2026-10-24', '11:00') },
    calendarHref: '/api/schedule/calendar.ics',
  };
})();
