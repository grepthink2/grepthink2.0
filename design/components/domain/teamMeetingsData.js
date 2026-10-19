/* GrepThink team meetings — sample data for the design kit (throwaway; the data layer owns the real shape).
   Authored in campus time (PT), stored as UTC ISO. window.GT_TEAM_MEETINGS_SAMPLE */
(function () {
  // PDT (-07:00) until Nov 1 2026, PST (-08:00) after.
  const at = (day, hm) => new Date(`${day}T${hm}:00${day >= '2026-11-01' ? '-08:00' : '-07:00'}`).toISOString();
  const Z = 'https://ucsc.zoom.us/j/93312007451';
  const people = {
    'u-ashton': { id: 'u-ashton', name: 'Ashton Liu', role: 'Product Owner' },
    'u-tony': { id: 'u-tony', name: 'Tony Wang', role: 'Scrum Master' },
    'u-landon': { id: 'u-landon', name: 'Landon Nguyen', role: 'Member' },
    'u-josh': { id: 'u-josh', name: 'Joshua Cruz', role: 'Member' },
  };
  const m = (id, title, day, hm, durationMinutes, extra) => ({ id, projectId: 'p-gt2', title, startsAt: at(day, hm), durationMinutes, location: null, zoomUrl: null, note: null, createdBy: 'u-ashton', updatedAt: at('2026-10-12', '09:00'), ...extra });
  const past = [
    m('tm-p1', 'Kickoff', '2026-10-05', '15:00', 30, { zoomUrl: Z, note: 'Introductions, repo access, how we run sprints.' }),
    m('tm-p2', 'Sprint 2 planning', '2026-10-06', '15:00', 60, { zoomUrl: Z }),
    m('tm-p3', 'Midterm check-in with Priya', '2026-10-14', '14:00', 30, { location: 'E2 room 180' }),
  ];
  const upcoming = [
    m('tm-1', 'Sprint 3 planning', '2026-10-20', '15:00', 60, { zoomUrl: Z, note: 'Bring your estimates for the backlog items tagged sprint-3.' }),
    m('tm-2', 'Design review with Priya', '2026-10-22', '16:00', 45, { location: 'E2 room 180', zoomUrl: Z }),
    m('tm-3', 'Sponsor demo', '2026-10-30', '13:00', 60, { zoomUrl: Z, note: 'Demo the roster import end to end — Landon drives, Tony takes questions.' }),
    m('tm-4', 'Retro + pizza', '2026-11-02', '17:30', 60, { location: 'BE 301' }),
  ];
  const more = [
    m('tm-5', 'API contract review', '2026-10-21', '11:00', 30, { zoomUrl: Z }),
    m('tm-6', 'Pair-programming block', '2026-10-24', '10:00', 120, { zoomUrl: Z, note: 'Optional. Grab whoever is on the same story.' }),
    m('tm-7', 'Usability test dry run', '2026-10-27', '15:00', 45, { location: 'E2 room 180' }),
    m('tm-8', 'Final review rehearsal — full run-through with slides, demo and Q&A practice', '2026-11-05', '16:00', 60, { zoomUrl: Z, note: 'Everyone presents their own slice. Time each section; we have 20 minutes total including questions, so keep the demo under eight.' }),
    m('tm-9', 'Prep for final review', '2026-11-06', '16:00', 60, { zoomUrl: Z }),
  ];
  window.GT_TEAM_MEETINGS_SAMPLE = {
    now: at('2026-10-20', '15:12'), teamName: 'Team 1', projectName: 'GrepThink 2.0', classLabel: '2026F CSE 115B', zoom: Z, people,
    members: ['Ashton Liu', 'Tony Wang', 'Landon Nguyen', 'Joshua Cruz'],
    past, upcoming, more,
    meetings: [...past, ...upcoming],
    many: [...past, ...upcoming, ...more],
  };
})();
