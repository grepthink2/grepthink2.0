/* Sample payloads for the Analytics UI kit — copies of
   docs/superpowers/handoffs/2026-10-05-analytics-claude-design/sample-data{,.empty}.json
   (AnalyticsDashboard contract, handoff §5). Loaded as a plain script. */
window.ANALYTICS_SAMPLE = {
  meta: { institution: { id: '6f2c3a2e-0000-4000-8000-000000000001', name: 'UC Santa Cruz', slug: 'ucsc', timezone: 'America/Los_Angeles' }, class: null,
    range: { preset: '30d', from: '2026-09-06', to: '2026-10-05', previous_from: '2026-08-07', previous_to: '2026-09-05' },
    generated_at: '2026-10-05T17:42:11Z', cached: false, k_anonymity: 3, rollup_as_of: '2026-10-04' },
  overview: { active_classes: 4, teams: 23, students: 118, active_users_7d: 96, messages: 1284, stories_created: 61, tasks_created: 302, story_points_created: 188, task_points_created: 611, on_time_rate: 0.82,
    deltas: { messages: 0.18, stories_created: -0.05, tasks_created: 0.22, on_time_rate: 0.03, active_users_7d: 0.09 },
    trends: { messages: [12, 18, 25, 31, 44, 52, 61, 58, 73, 88, 95, 102], tasks_created: [3, 6, 4, 9, 14, 12, 18, 21, 17, 26, 24, 29] } },
  conversations: { total: 1284, team_members: 572, dm: 712,
    weekly: [
      { week_start: '2026-09-07', team_members: 21, dm: 40 }, { week_start: '2026-09-14', team_members: 58, dm: 90 },
      { week_start: '2026-09-21', team_members: 131, dm: 156 }, { week_start: '2026-09-28', team_members: 188, dm: 214 },
      { week_start: '2026-10-05', team_members: 174, dm: 212 } ],
    excluded: ['team_ta', 'team_instructor', 'dm between staff and a student of their class'] },
  scrum: { live_as_of: '2026-10-05T17:42:11Z', stories_created: 61, tasks_created: 302, story_points_created: 188, task_points_created: 611,
    by_sprint: [
      { ordinal: 0, label: 'Backlog', teams: 23, todo: 94, in_progress: 0, done: 0, points_todo: 171, points_in_progress: 0, points_done: 0 },
      { ordinal: 1, label: 'Sprint 1', teams: 23, todo: 11, in_progress: 6, done: 118, points_todo: 19, points_in_progress: 13, points_done: 226 },
      { ordinal: 2, label: 'Sprint 2', teams: 21, todo: 38, in_progress: 27, done: 64, points_todo: 71, points_in_progress: 58, points_done: 139 },
      { ordinal: 3, label: 'Sprint 3', teams: 9, todo: 41, in_progress: 12, done: 7, points_todo: 83, points_in_progress: 27, points_done: 16 } ],
    chars: [
      { entity: 'task', ordinal: null, label: 'All sprints', n: 418, median: 29 }, { entity: 'task', ordinal: 1, label: 'Sprint 1', n: 135, median: 24 },
      { entity: 'task', ordinal: 2, label: 'Sprint 2', n: 129, median: 31 }, { entity: 'task', ordinal: 3, label: 'Sprint 3', n: 60, median: 36 },
      { entity: 'story', ordinal: null, label: 'All sprints', n: 112, median: 96 }, { entity: 'story', ordinal: 1, label: 'Sprint 1', n: 41, median: 78 },
      { entity: 'story', ordinal: 2, label: 'Sprint 2', n: 44, median: 102 }, { entity: 'story', ordinal: 3, label: 'Sprint 3', n: 27, median: 131 } ] },
  timeliness: { on_time_rate: 0.82, expected: 354, late: 38, missing: 26, edited_late: 9, bucket_order: ['early', 'on_time', 'late', 'missing', 'not_due'],
    rows: [
      { key: 'c1', label: 'CSE 115A', kind: 'class', class_id: 'c1', class_name: 'CSE 115A', expected: 123, buckets: { early: 71, on_time: 37, late: 9, missing: 6, not_due: 0 }, edited_late: 4, href: '/app/modules' },
      { key: 'c2', label: 'CSE 115B', kind: 'class', class_id: 'c2', class_name: 'CSE 115B', expected: 96, buckets: { early: 58, on_time: 24, late: 10, missing: 4, not_due: 0 }, edited_late: 2, href: '/app/modules' },
      { key: 'c3', label: 'CSE 115C', kind: 'class', class_id: 'c3', class_name: 'CSE 115C', expected: 87, buckets: { early: 40, on_time: 22, late: 13, missing: 12, not_due: 0 }, edited_late: 3, href: '/app/modules' },
      { key: 'c4', label: 'CSE 115D (pilot)', kind: 'class', class_id: 'c4', class_name: 'CSE 115D (pilot)', expected: 48, buckets: { early: 22, on_time: 14, late: 6, missing: 4, not_due: 2 }, edited_late: 0, href: '/app/modules' },
      { key: 'folded', label: 'Smaller groups (1)', kind: 'folded', expected: 2, buckets: { early: 1, on_time: 1, late: 0, missing: 0, not_due: 0 }, edited_late: 0 } ] },
  trends: { as_of: '2026-10-04', panels: [
    { key: 'team_messages_per_team', title: 'Messages per team', unit: 'per team per week',
      current: [{ week_start: '2026-09-07', value: 0.9 }, { week_start: '2026-09-14', value: 2.5 }, { week_start: '2026-09-21', value: 5.7 }, { week_start: '2026-09-28', value: 8.2 }, { week_start: '2026-10-05', value: null }],
      previous: [{ week_start: '2026-08-10', value: 0.0 }, { week_start: '2026-08-17', value: 0.0 }, { week_start: '2026-08-24', value: 0.3 }, { week_start: '2026-08-31', value: 0.8 }, { week_start: '2026-09-07', value: 0.9 }] },
    { key: 'tasks_per_team', title: 'Tasks created per team', unit: 'per team per week',
      current: [{ week_start: '2026-09-07', value: 1.1 }, { week_start: '2026-09-14', value: 2.9 }, { week_start: '2026-09-21', value: 4.6 }, { week_start: '2026-09-28', value: 4.5 }, { week_start: '2026-10-05', value: null }],
      previous: [{ week_start: '2026-08-10', value: 0.0 }, { week_start: '2026-08-17', value: 0.0 }, { week_start: '2026-08-24', value: 0.2 }, { week_start: '2026-08-31', value: 0.6 }, { week_start: '2026-09-07', value: 1.1 }] },
    { key: 'points_done_per_team', title: 'Points done per team', unit: 'per team',
      current: [{ week_start: '2026-09-07', value: 0.4 }, { week_start: '2026-09-14', value: 2.1 }, { week_start: '2026-09-21', value: 5.3 }, { week_start: '2026-09-28', value: 9.8 }, { week_start: '2026-10-05', value: null }], previous: null },
    { key: 'on_time_rate', title: 'On-time rate', unit: 'rate',
      current: [{ week_start: '2026-09-07', value: null }, { week_start: '2026-09-14', value: 0.91 }, { week_start: '2026-09-21', value: 0.84 }, { week_start: '2026-09-28', value: 0.79 }, { week_start: '2026-10-05', value: null }], previous: null } ] },
  breakdown: { kind: 'class', rows: [
    { id: 'c1', name: 'CSE 115A', kind: 'row', teams: 8, students: 41, team_messages: 228, stories: 24, tasks: 118, points_done_rate: 0.61, on_time_rate: 0.88, missing: 6, href: '/app/dashboard' },
    { id: 'c2', name: 'CSE 115B', kind: 'row', teams: 6, students: 31, team_messages: 151, stories: 17, tasks: 92, points_done_rate: 0.58, on_time_rate: 0.85, missing: 4, href: '/app/dashboard' },
    { id: 'c3', name: 'CSE 115C', kind: 'row', teams: 6, students: 29, team_messages: 133, stories: 14, tasks: 71, points_done_rate: 0.44, on_time_rate: 0.71, missing: 12, href: '/app/dashboard' },
    { id: 'c4', name: 'CSE 115D (pilot)', kind: 'row', teams: 3, students: 17, team_messages: 60, stories: 6, tasks: 21, points_done_rate: 0.33, on_time_rate: 0.75, missing: 4, href: '/app/dashboard' },
    { id: 'folded', name: 'Smaller groups (1)', kind: 'folded', teams: 1, students: 2, team_messages: 0, stories: 0, tasks: 0, points_done_rate: null, on_time_rate: 1.0, missing: 0 } ] },
  failures: [],
};

window.ANALYTICS_EMPTY = {
  meta: { institution: { id: '6f2c3a2e-0000-4000-8000-000000000002', name: 'İstinye University', slug: 'istinye', timezone: 'Europe/Istanbul' }, class: null,
    range: { preset: '30d', from: '2026-09-06', to: '2026-10-05', previous_from: '2026-08-07', previous_to: '2026-09-05' },
    generated_at: '2026-10-05T17:42:11Z', cached: false, k_anonymity: 3, rollup_as_of: null },
  overview: { active_classes: 1, teams: 0, students: 0, active_users_7d: null, messages: 0, stories_created: 0, tasks_created: 0, story_points_created: 0, task_points_created: 0, on_time_rate: null, deltas: {}, trends: {} },
  conversations: { total: 0, team_members: 0, dm: 0, weekly: [], excluded: ['team_ta', 'team_instructor', 'dm between staff and a student of their class'] },
  scrum: { live_as_of: '2026-10-05T17:42:11Z', stories_created: 0, tasks_created: 0, story_points_created: 0, task_points_created: 0, by_sprint: [], chars: [] },
  timeliness: { on_time_rate: null, expected: 0, late: 0, missing: 0, edited_late: 0, bucket_order: ['early', 'on_time', 'late', 'missing', 'not_due'], rows: [] },
  trends: { as_of: null, panels: [] },
  breakdown: { kind: 'class', rows: [] },
  failures: ['scrum'],
};

/* Demo-only: the per-assignment timeliness view and per-team breakdown a class
   selection returns from the API. Deterministic splits of the class totals. */
window.ANALYTICS_CLASS_VIEW = function (classId) {
  const base = window.ANALYTICS_SAMPLE;
  const cls = base.timeliness.rows.find((r) => r.key === classId);
  const bd = base.breakdown.rows.find((r) => r.id === classId);
  if (!cls || !bd) return null;
  const names = ['Interest Form', 'TSR 1', 'TSR 2', 'Sprint 1 Review', 'TSR 3', 'TSR 4', 'Mid-quarter Feedback', 'TSR 5', 'TSR 6', 'Sprint 2 Review', 'TSR 7', 'TSR 8'];
  const dues = ['2026-09-08', '2026-09-11', '2026-09-18', '2026-09-19', '2026-09-25', '2026-10-02', '2026-10-02', '2026-10-09', '2026-10-16', '2026-10-17', '2026-10-23', '2026-10-30'];
  const per = Math.max(1, Math.round(cls.expected / 6));
  const rows = names.map((n, i) => {
    const notDue = dues[i] > '2026-10-05';
    const seed = (i * 7 + classId.charCodeAt(1)) % 5;
    const early = notDue ? 0 : Math.max(0, per - 3 - seed), onTime = notDue ? 0 : Math.min(per, 2 + seed), late = notDue ? 0 : (i % 3), missing = notDue ? 0 : (i % 4 === 0 ? 2 : 0);
    const expected = notDue ? per : early + onTime + late + missing;
    return { key: `${classId}-a${i}`, label: n, kind: 'assignment', assignment_type: n.startsWith('TSR') ? 'tsr' : n.includes('Interest') ? 'interest_form' : 'feedback', due_at: dues[i], expected,
      buckets: { early, on_time: onTime, late, missing, not_due: notDue ? per : 0 }, edited_late: i % 5 === 0 ? 1 : 0, href: '/app/modules', notDueYet: notDue };
  });
  const teams = Array.from({ length: bd.teams }).map((_, i) => ({
    id: `${classId}-t${i + 1}`, name: `Team ${i + 1}`, kind: 'row', members: 4 + (i % 3), team_messages: Math.round(bd.team_messages / bd.teams * (0.6 + ((i * 37) % 10) / 12)),
    stories: Math.round(bd.stories / bd.teams) + (i % 2), tasks: Math.round(bd.tasks / bd.teams) + (i % 4), points_done_rate: Math.min(0.95, 0.3 + ((i * 53) % 10) / 15), on_time_rate: Math.min(1, 0.6 + ((i * 29) % 10) / 25), missing: i % 3, href: '/app/dashboard' }));
  return { rows, teams };
};
