import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClass } from '@/lib/api';

const api = vi.hoisted(() => ({ getClasses: vi.fn(), updateClassStatus: vi.fn() }));
const preview = vi.hoisted(() => ({ isPreviewing: false, exitPreview: vi.fn() }));

vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => preview }));

import { ClassProvider, useClass, useClassRole, useSelectedClassRole } from '../classContext';

const UCSC = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };
const IST = { id: 'ist', name: 'İstinye University', slug: 'istinye' };

function cls(id: string, extra: Partial<ApiClass>): ApiClass {
  return { id, name: id, created_by: 'someone', created_at: '2026-01-01', status: 'active', ...extra };
}

function Probe() {
  const { selectedClass, setSelectedClass, classes, sidebarClasses, schools, showSchoolSwitcher, selectSchool } = useClass();
  const selectedRole = useSelectedClassRole();
  const taughtRole = useClassRole('taught');
  return (
    <>
      <output data-testid="selected">{selectedClass?.id ?? 'none'}</output>
      <output data-testid="selected-role">{String(selectedRole)}</output>
      <output data-testid="taught-role">{String(taughtRole)}</output>
      <output data-testid="sidebar">{sidebarClasses.map((c) => c.id).join(',')}</output>
      <output data-testid="schools">{schools.map((s) => s.id).join(',')}</output>
      <output data-testid="switcher">{String(showSchoolSwitcher)}</output>
      {classes.map((c) => (
        <button key={c.id} onClick={() => setSelectedClass(c)}>{`select ${c.id}`}</button>
      ))}
      <button onClick={() => selectSchool('ucsc')}>school ucsc</button>
    </>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  localStorage.clear();
  preview.isPreviewing = false;
});
afterEach(() => vi.clearAllMocks());

describe('class roles', () => {
  it('reads my_role per class and derives it when an older backend omits it', async () => {
    api.getClasses.mockResolvedValue({
      classes: [
        cls('taught', { my_role: 'instructor', institution: IST }),
        cls('assisted', { my_role: 'ta', institution: UCSC }),
        cls('legacy', { created_by: 'me' }),
      ],
    });
    render(<ClassProvider><Probe /></ClassProvider>);
    expect(text('selected-role')).toBe('undefined'); // loading
    await waitFor(() => expect(text('selected')).toBe('taught'));
    expect(text('selected-role')).toBe('instructor');
    expect(text('taught-role')).toBe('instructor');
    act(() => screen.getByText('select assisted').click());
    expect(text('selected-role')).toBe('ta');
    act(() => screen.getByText('select legacy').click());
    expect(text('selected-role')).toBe('instructor'); // created_by === me
  });

  it('answers null for a class the user is not in', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('other', { my_role: 'student' })] });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('other'));
    expect(text('taught-role')).toBe('null');
  });

  it('reports student for the selected class you teach while previewing, and ends preview on a class switch', async () => {
    preview.isPreviewing = true;
    api.getClasses.mockResolvedValue({
      classes: [cls('taught', { my_role: 'instructor' }), cls('assisted', { my_role: 'ta' })],
    });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('taught'));
    expect(text('selected-role')).toBe('student');
    expect(preview.exitPreview).not.toHaveBeenCalled(); // classes arriving is not a switch
    act(() => screen.getByText('select assisted').click());
    expect(preview.exitPreview).toHaveBeenCalledTimes(1);
  });
});

describe('schools', () => {
  it('hides the switcher and keeps every active class with one school', async () => {
    api.getClasses.mockResolvedValue({
      classes: [cls('a', { my_role: 'student', institution: UCSC }), cls('b', { my_role: 'student', institution: UCSC })],
    });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('a'));
    expect(text('switcher')).toBe('false');
    expect(text('sidebar')).toBe('a,b');
  });

  it('with two schools, lists only the current school in the class switcher and returns to the last class used there', async () => {
    api.getClasses.mockResolvedValue({
      classes: [
        cls('taught', { my_role: 'instructor', institution: IST }),
        cls('assisted', { my_role: 'ta', institution: UCSC }),
        cls('second', { my_role: 'student', institution: UCSC }),
      ],
    });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('taught'));
    expect(text('switcher')).toBe('true');
    expect(text('schools')).toBe('ist,ucsc'); // ordered by name
    expect(text('sidebar')).toBe('taught');
    act(() => screen.getByText('select second').click());
    expect(text('sidebar')).toBe('assisted,second');
    act(() => screen.getByText('select taught').click());
    act(() => screen.getByText('school ucsc').click());
    expect(text('selected')).toBe('second'); // remembered, not the first UCSC class
  });
});

describe('refresh on focus', () => {
  afterEach(() => vi.useRealTimers());

  it('re-reads the class list when the tab regains focus, at most every 30 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
    api.getClasses.mockResolvedValue({ classes: [cls('a', { my_role: 'student' })] });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('a'));
    api.getClasses.mockResolvedValue({
      classes: [cls('a', { my_role: 'student' }), cls('b', { my_role: 'ta' })],
    });
    // Regaining focus fires both events.
    const regainFocus = () =>
      act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });

    await regainFocus(); // the list was just loaded
    expect(api.getClasses).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-25T10:00:30Z'));
    await regainFocus();
    await waitFor(() => expect(text('sidebar')).toBe('a,b'));
    expect(api.getClasses).toHaveBeenCalledTimes(2); // one request for both events
  });
});
