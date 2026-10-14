/* Sample search corpus for the gallery + UI kit (demo only). window.GT_SEARCH_SAMPLE */
(function () {
  const d = (s) => `2026-10-${String(s).padStart(2, '0')}T17:00:00Z`;
  const items = [
    // tasks (user-scoped: assignedToMe)
    { id: 't1', type: 'task', key: 'GT-12', title: 'Roster CSV importer rejects UTF-8 BOM', projectId: 'p1', status: 'in_progress', dueAt: d(9), points: 3, estimateHours: 4, tags: ['backend', 'bug'], assignedToMe: true },
    { id: 't2', type: 'task', key: 'GT-18', title: 'Roster table — sticky header on scroll', projectId: 'p1', status: 'todo', dueAt: d(12), points: 2, estimateHours: 2, tags: ['frontend'], assignedToMe: true },
    { id: 't3', type: 'task', key: 'GT-7', title: 'Roster export: include team column', projectId: 'p1', status: 'done', dueAt: d(2), points: 1, estimateHours: 1, tags: ['backend'], assignedToMe: true },
    { id: 't4', type: 'task', key: 'GT-21', title: 'Design empty state for roster', projectId: 'p1', status: 'todo', dueAt: d(14), points: 2, estimateHours: 3, tags: ['UI/UX', 'design'], assignedToMe: true },
    { id: 't5', type: 'task', key: 'GT-23', title: 'Write roster API docs', projectId: 'p1', status: 'todo', dueAt: d(20), points: 1, estimateHours: 2, tags: ['docs'], assignedToMe: true },
    { id: 't6', type: 'task', key: 'GT-9', title: 'Supabase RLS policy for roster reads', projectId: 'p1', status: 'in_progress', dueAt: d(10), points: 5, estimateHours: 6, tags: ['infra', 'backend'], assignedToMe: true },
    { id: 't7', type: 'task', key: 'GT-30', title: 'Burnup chart tooltip overlaps legend', projectId: 'p1', status: 'todo', dueAt: d(16), points: 2, estimateHours: 2, tags: ['frontend', 'bug'], assignedToMe: true },
    // stories
    { id: 's1', type: 'story', key: 'US-4', title: 'Instructor imports a roster from Canvas', projectId: 'p1', status: 'in_progress', sprint: 'Sprint 3', points: 8, tasksDone: 2, tasksTotal: 5, dueAt: d(17), assignedToMe: true },
    { id: 's2', type: 'story', key: 'US-9', title: 'Student searches the roster for teammates', projectId: 'p1', status: 'todo', sprint: 'Sprint 4', points: 5, tasksDone: 0, tasksTotal: 3, dueAt: d(31), assignedToMe: true },
    // people
    { id: 'u1', type: 'person', title: 'Ashton Liu', email: 'aliu@ucsc.edu', subtitle: 'Student · CSE 115B · Team 1', role: 'student', sameTeam: true, sameClass: true, conversationId: 'c3' },
    { id: 'u2', type: 'person', title: 'Rosa Trinh', email: 'rtrinh@ucsc.edu', subtitle: 'TA · CSE 115B', role: 'ta', sameClass: true },
    { id: 'u3', type: 'person', title: 'Tony Wu', email: 'twu@ucsc.edu', subtitle: 'Student · CSE 115B · Team 1', role: 'student', sameTeam: true, sameClass: true },
    { id: 'u4', type: 'person', title: 'Priya Raman', email: 'praman@ucsc.edu', subtitle: 'Student · CSE 115B · Team 4', role: 'student', sameClass: true },
    { id: 'u5', type: 'person', title: 'Richard Jullig', email: 'rjullig@ucsc.edu', subtitle: 'Instructor · CSE 115B', role: 'instructor', sameClass: true },
    // chats
    { id: 'c1', type: 'conversation', title: 'Team 1 · Grepthink 2.0', subtitle: 'Team channel', unread: 3, lastMessageAt: d(7) },
    { id: 'c2', type: 'conversation', title: 'Roster sync thread', subtitle: 'Team channel', unread: 0, lastMessageAt: d(5) },
    { id: 'c3', type: 'conversation', title: 'Ashton Liu', subtitle: 'Direct message', unread: 1, lastMessageAt: d(7) },
    { id: 'c4', type: 'conversation', title: 'Rosa Trinh (TA)', subtitle: 'Direct message', unread: 0, lastMessageAt: d(1) },
    // projects
    { id: 'p1', type: 'project', projectId: 'p1', title: 'Grepthink 2.0', subtitle: 'Team 1 · Active', memberCount: 4, updatedAt: d(7), keywords: ['roster', 'scrum'] },
    { id: 'p2', type: 'project', projectId: 'p2', title: 'Roster Radar', subtitle: 'Team 4 · Active', memberCount: 5, updatedAt: d(6) },
    { id: 'p3', type: 'project', projectId: 'p3', title: 'Slug Dining', subtitle: 'Team 2 · Archived', memberCount: 4, archived: true, updatedAt: d(1) },
    // teams
    { id: 'tm1', type: 'team', projectId: 'p1', title: 'Team 1', subtitle: 'Grepthink 2.0 · CSE 115B', memberCount: 4, updatedAt: d(7) },
    { id: 'tm2', type: 'team', projectId: 'p2', title: 'Team 4', subtitle: 'Roster Radar · CSE 115B', memberCount: 5, updatedAt: d(6) },
    // classes & assignments
    { id: 'k1', type: 'class', title: 'CSE 115B', subtitle: 'Software Design Project II', term: 'Fall 2026', keywords: ['roster'] },
    { id: 'k2', type: 'class', title: 'CSE 115A', subtitle: 'Introduction to Software Engineering', term: 'Spring 2026' },
    { id: 'a1', type: 'assignment', kind: 'tsr', title: 'TSR 3', subtitle: 'Team Status Report · Due Oct 12', dueAt: d(12) },
    { id: 'a2', type: 'assignment', kind: 'interest_form', title: 'Interest Form — roster preferences', subtitle: 'Interest form · Due Oct 20', dueAt: d(20) },
    // actions
    { id: 'x1', type: 'action', title: 'Leave class', subtitle: 'Opens My Classes', href: '/app/my-classes', keywords: ['leave class', 'drop class', 'unenroll'] },
  ];
  const recent = [items.find((i) => i.id === 't1'), items.find((i) => i.id === 'c1'), items.find((i) => i.id === 'p1'), items.find((i) => i.id === 'u1')];
  window.GT_SEARCH_SAMPLE = { items, recent };
})();
