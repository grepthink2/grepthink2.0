import { describe, expect, it } from 'vitest';
import {
  classLandingPath,
  isClassScopedPath,
  isPathAllowedForClassRole,
  pathAfterClassSwitch,
} from '../routePermissions';

describe('class route rules', () => {
  it('opens instructor pages to the class instructor only', () => {
    expect(isPathAllowedForClassRole('/app/dashboard', 'instructor')).toBe(true);
    expect(isPathAllowedForClassRole('/app/dashboard', 'ta')).toBe(false);
    expect(isPathAllowedForClassRole('/app/dashboard', null)).toBe(false);
  });

  it('keeps Staffing, reached from Assign Projects, to the class instructor', () => {
    expect(isPathAllowedForClassRole('/app/staff-projects', 'instructor')).toBe(true);
    expect(isPathAllowedForClassRole('/app/staff-projects', 'ta')).toBe(false);
    expect(isPathAllowedForClassRole('/app/staff-projects', 'student')).toBe(false);
  });

  it('opens student pages to students and TAs', () => {
    expect(isPathAllowedForClassRole('/app/my-project', 'student')).toBe(true);
    expect(isPathAllowedForClassRole('/app/my-project', 'ta')).toBe(true);
    expect(isPathAllowedForClassRole('/app/my-project', 'instructor')).toBe(false);
  });

  it('opens TA Review and each review in it to a TA of the class only', () => {
    for (const path of ['/app/ta-review', '/app/ta-review/a1']) {
      expect(isPathAllowedForClassRole(path, 'ta')).toBe(true);
      expect(isPathAllowedForClassRole(path, 'student')).toBe(false);
      expect(isPathAllowedForClassRole(path, 'instructor')).toBe(false);
      expect(isPathAllowedForClassRole(path, null)).toBe(false);
    }
  });

  it('leaves Final Reviews under TA Review to its own guard (instructors and TAs)', () => {
    for (const path of ['/app/ta-review/final-reviews', '/app/ta-review/final-reviews/p1']) {
      expect(isPathAllowedForClassRole(path, 'instructor')).toBe(true);
      expect(isPathAllowedForClassRole(path, 'ta')).toBe(true);
    }
  });

  it('shares every other page', () => {
    expect(isPathAllowedForClassRole('/app/home', undefined)).toBe(true);
    expect(isPathAllowedForClassRole('/app/ta-meetings', 'student')).toBe(true);
    expect(isPathAllowedForClassRole('/app/roster', 'ta')).toBe(true);
    expect(isPathAllowedForClassRole('/app/create-project', 'instructor')).toBe(true); // Projects' Add Project
    expect(isPathAllowedForClassRole('/app/create-project', 'student')).toBe(true);
  });

  it('knows which pages need a class and a role in it', () => {
    for (const path of [
      '/app/dashboard',
      '/app/staff-projects',
      '/app/my-project',
      '/app/assignments',
      '/app/ta-review',
      '/app/ta-review/a1',
    ]) {
      expect(isClassScopedPath(path), path).toBe(true);
    }
    for (const path of [
      '/app/home',
      '/app/my-classes',
      '/app/roster',
      '/app/ta-meetings',
      '/app/create-project',
      '/app/projects/p1',
      '/app/assignments/a1',
      '/app/ta-review/final-reviews',
      '/app/ta-review/final-reviews/p1',
    ]) {
      expect(isClassScopedPath(path), path).toBe(false);
    }
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
    expect(pathAfterClassSwitch('/app/ta-review', 'student')).toBe('/app/my-project');
  });

  it("leaves another class's detail page for its list, when your role may open that list", () => {
    expect(pathAfterClassSwitch('/app/assignments/a1', 'student')).toBe('/app/assignments');
    expect(pathAfterClassSwitch('/app/assignments/a1', 'ta')).toBe('/app/assignments');
    expect(pathAfterClassSwitch('/app/modules/tsr/t1', 'instructor')).toBe('/app/modules');
    expect(pathAfterClassSwitch('/app/modules/feedback/f1', 'instructor')).toBe('/app/modules');
    expect(pathAfterClassSwitch('/app/ta-review/a1', 'ta')).toBe('/app/ta-review');
  });

  it("otherwise leaves another class's detail page for your landing page", () => {
    expect(pathAfterClassSwitch('/app/assignments/a1', 'instructor')).toBe('/app/dashboard');
    expect(pathAfterClassSwitch('/app/modules/tsr/t1', 'ta')).toBe('/app/ta-meetings');
    expect(pathAfterClassSwitch('/app/modules/feedback/f1', 'student')).toBe('/app/my-project');
    expect(pathAfterClassSwitch('/app/ta-review/a1', 'instructor')).toBe('/app/dashboard');
  });

  it('keeps shared detail pages after a class switch', () => {
    expect(pathAfterClassSwitch('/app/projects/p1', 'ta')).toBeNull();
    expect(pathAfterClassSwitch('/app/ta-review/final-reviews/p1', 'instructor')).toBeNull();
  });
});
