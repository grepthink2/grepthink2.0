import { describe, expect, it } from 'vitest';
import { buildSidebarConfig } from '../sidebar';

const labels = (canCreateClasses: boolean, classRole: 'instructor' | 'ta' | 'student' | null) =>
  buildSidebarConfig({ canCreateClasses, classRole }).map((s) => [s.title, s.items.map((i) => i.label)]);

describe('buildSidebarConfig', () => {
  it('keeps the instructor sidebar for a class you teach', () => {
    expect(labels(true, 'instructor')).toEqual([
      ['Main', ['Home', 'Messages', 'My Classes', 'Create Class']],
      ['Class', ['Dashboard', 'Projects', 'Roster', 'Modules', 'TA Management', 'TA Meetings', 'Final Reviews']],
      ['Settings', ['Settings', 'Help Center']],
    ]);
  });

  it('shows the student items plus TA Review in a class you TA, even for an account that can create classes', () => {
    const [main, cls] = labels(true, 'ta');
    expect(main).toEqual(['Main', ['Home', 'Messages', 'My Classes', 'Create Class']]);
    expect(cls).toEqual(['Class', ['Create Project', 'Browse Projects', 'My Project', 'Assignments', 'Roster', 'TA Meetings', 'TA Review']]);
  });

  it('keeps the student sidebar for a student account', () => {
    expect(labels(false, 'student')[0]).toEqual(['Main', ['Home', 'Messages', 'Join Class', 'My Classes']]);
  });

  it('hides the class section with no class selected', () => {
    expect(labels(false, null).map(([title]) => title)).toEqual(['Main', 'Settings']);
  });
});
