import { describe, expect, it } from 'vitest';
import { classLandingPath, isPathAllowedForClassRole, pathAfterClassSwitch } from '../routePermissions';

describe('class route rules', () => {
  it('opens instructor pages to the class instructor only', () => {
    expect(isPathAllowedForClassRole('/app/dashboard', 'instructor')).toBe(true);
    expect(isPathAllowedForClassRole('/app/dashboard', 'ta')).toBe(false);
    expect(isPathAllowedForClassRole('/app/dashboard', null)).toBe(false);
  });

  it('opens student pages to students and TAs', () => {
    expect(isPathAllowedForClassRole('/app/my-project', 'student')).toBe(true);
    expect(isPathAllowedForClassRole('/app/my-project', 'ta')).toBe(true);
    expect(isPathAllowedForClassRole('/app/my-project', 'instructor')).toBe(false);
  });

  it('shares every other page', () => {
    expect(isPathAllowedForClassRole('/app/home', undefined)).toBe(true);
    expect(isPathAllowedForClassRole('/app/ta-meetings', 'student')).toBe(true);
  });

  it('lands each role on its page', () => {
    expect(classLandingPath('instructor')).toBe('/app/dashboard');
    expect(classLandingPath('ta')).toBe('/app/ta-meetings');
    expect(classLandingPath('student')).toBe('/app/my-project');
  });

  it('stays on a shared or allowed page after a class switch', () => {
    expect(pathAfterClassSwitch('/app/home', 'ta')).toBeNull();
    expect(pathAfterClassSwitch('/app/dashboard', 'instructor')).toBeNull();
    expect(pathAfterClassSwitch('/app/dashboard', 'ta')).toBe('/app/ta-meetings');
  });
});
