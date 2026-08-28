import { buildBreadcrumbs } from '../Header';

const CLASS = 'CSE 115A';

describe('buildBreadcrumbs — scrum board', () => {
  it('appends a Scrum Board crumb with a link back to the project', () => {
    const crumbs = buildBreadcrumbs('/app/projects/p1/board', 'instructor', CLASS, {
      projectName: 'GrepThink 2.0',
    });
    expect(crumbs?.map((c) => c.label)).toEqual([
      CLASS,
      'Projects',
      'GrepThink 2.0',
      'Scrum Board',
    ]);
    expect(crumbs?.[2].path).toBe('/app/projects/p1');
    expect(crumbs?.[3].path).toBeUndefined();
  });

  it('uses the student parent crumb', () => {
    const crumbs = buildBreadcrumbs('/app/projects/p1/board', 'student', CLASS, null);
    expect(crumbs?.[1]).toEqual({ label: 'Browse Projects', path: '/app/browse-projects' });
    expect(crumbs?.[2].label).toBe('Project'); // no projectName in state
  });

  it('leaves the plain project route unchanged', () => {
    const crumbs = buildBreadcrumbs('/app/projects/p1', 'instructor', CLASS, {
      projectName: 'GrepThink 2.0',
    });
    expect(crumbs?.map((c) => c.label)).toEqual([CLASS, 'Projects', 'GrepThink 2.0']);
  });

  it('does not match a deeper path than /board', () => {
    const crumbs = buildBreadcrumbs('/app/projects/p1/board/extra', 'instructor', CLASS, null);
    expect(crumbs?.some((c) => c.label === 'Scrum Board')).toBe(false);
  });
});
