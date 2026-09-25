/** Breadcrumbs for class-contextual routes, apart from Header.tsx so that file
 *  exports only components (react-refresh) while the builder stays testable. */

export interface BreadcrumbSegment {
  label: string;
  /** If provided, renders as a clickable button that navigates to this path. */
  path?: string;
}

/**
 * Returns an ordered array of breadcrumb segments for class-contextual routes,
 * or null for routes that have no class breadcrumb (standalone pages like Home).
 *
 * Adding a new route: just add a case in the instructor or student block below.
 */
export function buildBreadcrumbs(
  pathname: string,
  role: string | null,
  className: string | undefined,
  locationState: unknown,
): BreadcrumbSegment[] | null {
  if (!className) return null;

  const state = locationState as { projectName?: string; assignmentName?: string } | null;

  // Class root segment — instructor links to Dashboard, students have no dedicated class home
  const classSegment: BreadcrumbSegment = {
    label: className,
    path: role === 'instructor' ? '/app/dashboard' : undefined,
  };

  // ── Shared detail routes (role determines the parent crumb) ──────────────
  // Scrum board sits under a project — must precede the generic project case.
  if (/^\/app\/projects\/[^/]+\/board$/.test(pathname)) {
    const projectId = pathname.split('/')[3];
    const parentLabel = role === 'instructor' ? 'Projects' : 'Browse Projects';
    const parentPath = role === 'instructor' ? '/app/projects' : '/app/browse-projects';
    return [
      classSegment,
      { label: parentLabel, path: parentPath },
      { label: state?.projectName ?? 'Project', path: `/app/projects/${projectId}` },
      { label: 'Scrum Board' },
    ];
  }

  if (pathname.startsWith('/app/projects/') && pathname !== '/app/projects') {
    const projectName = state?.projectName;
    const parentLabel = role === 'instructor' ? 'Projects' : 'Browse Projects';
    const parentPath = role === 'instructor' ? '/app/projects' : '/app/browse-projects';
    return [
      classSegment,
      { label: parentLabel, path: parentPath },
      { label: projectName ?? 'Project' },
    ];
  }

  if (pathname.startsWith('/app/assignments/') && pathname !== '/app/assignments') {
    const assignmentName = state?.assignmentName;
    return [
      classSegment,
      { label: 'Assignments', path: '/app/assignments' },
      { label: assignmentName ?? 'Assignment' },
    ];
  }

  if (pathname.startsWith('/app/modules/tsr/')) {
    const assignmentName = state?.assignmentName;
    return [
      classSegment,
      { label: 'Modules', path: '/app/modules' },
      { label: assignmentName ?? 'TSR Responses' },
    ];
  }

  if (pathname.startsWith('/app/modules/feedback/')) {
    const assignmentName = state?.assignmentName;
    return [
      classSegment,
      { label: 'Modules', path: '/app/modules' },
      { label: assignmentName ?? 'Feedback Responses' },
    ];
  }

  // ── Instructor routes ────────────────────────────────────────────────────
  if (role === 'instructor') {
    if (pathname === '/app/dashboard')     return [classSegment, { label: 'Dashboard' }];
    if (pathname === '/app/projects')      return [classSegment, { label: 'Projects' }];
    if (pathname === '/app/roster')        return [classSegment, { label: 'Roster' }];
    if (pathname === '/app/modules')       return [classSegment, { label: 'Modules' }];
    if (pathname === '/app/ta-management') return [classSegment, { label: 'TA Management' }];
    if (pathname === '/app/assignments')   return [classSegment, { label: 'Assignments' }];
    if (pathname === '/app/create-project') {
      return [classSegment, { label: 'Projects', path: '/app/projects' }, { label: 'Create Project' }];
    }
    // Project subroutes
    if (pathname === '/app/assign-projects') {
      return [classSegment, { label: 'Projects', path: '/app/projects' }, { label: 'Assign Projects' }];
    }
    if (pathname === '/app/staff-projects') {
      return [classSegment, { label: 'Projects', path: '/app/projects' }, { label: 'Staffing' }];
    }
  }

  // ── Student routes ───────────────────────────────────────────────────────
  if (role === 'student') {
    if (pathname === '/app/browse-projects') return [classSegment, { label: 'Browse Projects' }];
    if (pathname === '/app/my-project')      return [classSegment, { label: 'My Project' }];
    if (pathname === '/app/assignments')     return [classSegment, { label: 'Assignments' }];
    if (pathname === '/app/create-project')  return [classSegment, { label: 'Create Project' }];
  }

  return null;
}
