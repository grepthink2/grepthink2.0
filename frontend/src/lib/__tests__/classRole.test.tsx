import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClass } from '@/lib/api';

const api = vi.hoisted(() => ({ getClasses: vi.fn(), updateClassStatus: vi.fn() }));
const preview = vi.hoisted(() => ({ isPreviewing: false, exitPreview: vi.fn() }));

vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => preview }));

import { ClassProvider, useClass, useClassRole, useSelectedClassRole } from '../classContext';

const SELECTED_KEY = 'grepthink-selected-class-id';
const UCSC = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };
const IST = { id: 'ist', name: 'İstinye University', slug: 'istinye' };

function cls(id: string, extra: Partial<ApiClass>): ApiClass {
  return { id, name: id, created_by: 'someone', created_at: '2026-01-01', status: 'active', ...extra };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Probe() {
  const {
    selectedClass,
    setSelectedClass,
    classes,
    sidebarClasses,
    schools,
    showSchoolSwitcher,
    selectSchool,
    previewClassId,
  } = useClass();
  const selectedRole = useSelectedClassRole();
  const taughtRole = useClassRole('taught');
  const [picked, setPicked] = useState('');
  return (
    <>
      <output data-testid="selected">{selectedClass?.id ?? 'none'}</output>
      <output data-testid="selected-role">{String(selectedRole)}</output>
      <output data-testid="taught-role">{String(taughtRole)}</output>
      <output data-testid="sidebar">{sidebarClasses.map((c) => c.id).join(',')}</output>
      <output data-testid="schools">{schools.map((s) => s.id).join(',')}</output>
      <output data-testid="switcher">{String(showSchoolSwitcher)}</output>
      <output data-testid="preview-class">{String(previewClassId)}</output>
      <output data-testid="picked">{picked}</output>
      <output data-testid="statuses">{classes.map((c) => `${c.id}:${c.status}`).join(',')}</output>
      {classes.map((c) => (
        <button key={c.id} onClick={() => setSelectedClass(c)}>{`select ${c.id}`}</button>
      ))}
      <button onClick={() => setPicked(selectSchool('ucsc')?.id ?? 'none')}>school ucsc</button>
    </>
  );
}

/** What pages do: refresh after a join or create, refresh on a timer, change a class's status. */
function Controls() {
  const { refreshClasses, setClassLifecycleStatus } = useClass();
  return (
    <>
      <button onClick={() => void refreshClasses(false)}>refresh</button>
      <button onClick={() => void refreshClasses(false, 'new')}>refresh selecting new</button>
      <button onClick={() => void setClassLifecycleStatus('x', 'complete')}>complete x</button>
    </>
  );
}

/** Every distinct selectedClass and classes object consumers were handed. */
const seenSelected = new Set<unknown>();
const seenLists = new Set<unknown>();
function IdentityLog() {
  const { selectedClass, classes } = useClass();
  useEffect(() => {
    if (selectedClass) seenSelected.add(selectedClass);
  }, [selectedClass]);
  useEffect(() => {
    if (classes.length > 0) seenLists.add(classes);
  }, [classes]);
  return null;
}

function renderProvider(extra?: ReactNode) {
  return render(
    <ClassProvider>
      <Probe />
      {extra}
    </ClassProvider>,
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  localStorage.clear();
  preview.isPreviewing = false;
  seenSelected.clear();
  seenLists.clear();
});
afterEach(() => vi.resetAllMocks());

describe('class roles', () => {
  it('reads my_role per class and derives it when an older backend omits it', async () => {
    api.getClasses.mockResolvedValue({
      classes: [
        cls('taught', { my_role: 'instructor', institution: IST }),
        cls('assisted', { my_role: 'ta', institution: UCSC }),
        cls('legacy', { created_by: 'me' }),
        cls('joined', {}),
      ],
    });
    renderProvider();
    expect(text('selected-role')).toBe('undefined'); // loading
    await waitFor(() => expect(text('selected')).toBe('taught'));
    expect(text('selected-role')).toBe('instructor');
    expect(text('taught-role')).toBe('instructor');
    act(() => screen.getByText('select assisted').click());
    expect(text('selected-role')).toBe('ta');
    act(() => screen.getByText('select legacy').click());
    expect(text('selected-role')).toBe('instructor'); // created_by === me
    act(() => screen.getByText('select joined').click());
    expect(text('selected-role')).toBe('student'); // created by someone else
  });

  it('answers undefined while the classes load', () => {
    api.getClasses.mockReturnValue(new Promise(() => {}));
    renderProvider();
    expect(text('selected-role')).toBe('undefined');
    expect(text('taught-role')).toBe('undefined');
  });

  it('answers null for a class the user is not in', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('other', { my_role: 'student' })] });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('other'));
    expect(text('taught-role')).toBe('null');
  });
});

describe('view class as student', () => {
  it('reports student for the class you teach that it previews, and ends on a class switch', async () => {
    preview.isPreviewing = true;
    api.getClasses.mockResolvedValue({
      classes: [cls('taught', { my_role: 'instructor' }), cls('assisted', { my_role: 'ta' })],
    });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('taught'));
    expect(text('selected-role')).toBe('student');
    expect(text('preview-class')).toBe('taught');
    expect(preview.exitPreview).not.toHaveBeenCalled(); // classes arriving is not a switch
    act(() => screen.getByText('select assisted').click());
    expect(preview.exitPreview).toHaveBeenCalledTimes(1);
  });

  it('leaves another class you teach as yours', async () => {
    preview.isPreviewing = true;
    api.getClasses.mockResolvedValue({
      classes: [cls('first', { my_role: 'instructor' }), cls('taught', { my_role: 'instructor' })],
    });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('first'));
    expect(text('selected-role')).toBe('student');
    expect(text('taught-role')).toBe('instructor');
  });

  it('shows the class you switch to with its own role while the preview ends', async () => {
    preview.isPreviewing = true;
    api.getClasses.mockResolvedValue({
      classes: [cls('first', { my_role: 'instructor' }), cls('taught', { my_role: 'instructor' })],
    });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('first'));
    act(() => screen.getByText('select taught').click());
    expect(text('selected-role')).toBe('instructor'); // never the student view of the next class
    expect(preview.exitPreview).toHaveBeenCalledTimes(1);
  });

  it('lets go of the previewed class when the preview ends', async () => {
    preview.isPreviewing = true;
    api.getClasses.mockResolvedValue({ classes: [cls('taught', { my_role: 'instructor' })] });
    const { rerender } = renderProvider();
    await waitFor(() => expect(text('preview-class')).toBe('taught'));
    preview.isPreviewing = false;
    rerender(
      <ClassProvider>
        <Probe />
      </ClassProvider>,
    );
    expect(text('preview-class')).toBe('null');
    expect(text('selected-role')).toBe('instructor');
  });
});

describe('schools', () => {
  it('hides the switcher and keeps every active class with one school', async () => {
    api.getClasses.mockResolvedValue({
      classes: [cls('a', { my_role: 'student', institution: UCSC }), cls('b', { my_role: 'student', institution: UCSC })],
    });
    renderProvider();
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
    renderProvider();
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

  it("selectSchool falls back to the school's first active class and returns it", async () => {
    api.getClasses.mockResolvedValue({
      classes: [
        cls('taught', { my_role: 'instructor', institution: IST }),
        cls('assisted', { my_role: 'ta', institution: UCSC }),
        cls('second', { my_role: 'student', institution: UCSC }),
      ],
    });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('taught'));
    act(() => screen.getByText('school ucsc').click()); // nothing used at UCSC yet
    expect(text('selected')).toBe('assisted');
    expect(text('picked')).toBe('assisted');
  });

  it('keeps classes with no school in the class switcher', async () => {
    api.getClasses.mockResolvedValue({
      classes: [
        cls('u1', { my_role: 'student', institution: UCSC }),
        cls('i1', { my_role: 'ta', institution: IST }),
        cls('n1', { my_role: 'instructor', institution: null }),
      ],
    });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('u1'));
    expect(text('sidebar')).toBe('u1,n1');
    act(() => screen.getByText('select i1').click());
    expect(text('sidebar')).toBe('i1,n1');
    act(() => screen.getByText('select n1').click());
    expect(text('sidebar')).toBe('u1,i1,n1'); // no current school
  });

  it('never leaves the class switcher empty, and keeps the schools in name order', async () => {
    const ALPHA = { id: 'alpha', name: 'Alpha College', slug: 'alpha' };
    api.getClasses.mockResolvedValue({
      classes: [
        cls('u1', { my_role: 'student', institution: UCSC }),
        cls('i1', { my_role: 'ta', institution: IST }),
        cls('old', { my_role: 'instructor', institution: ALPHA, status: 'complete' }),
      ],
    });
    localStorage.setItem(SELECTED_KEY, 'old'); // a finished class at a third school
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('old'));
    expect(text('sidebar')).toBe('u1,i1');
    expect(text('schools')).toBe('alpha,ist,ucsc');
  });
});

describe('refreshes', () => {
  const T0 = Date.parse('2026-09-25T10:00:00Z');
  const at = (seconds: number) => vi.setSystemTime(T0 + seconds * 1000);
  // Regaining focus fires both events.
  const regainFocus = () =>
    act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
  });
  afterEach(() => vi.useRealTimers());

  it('re-reads the class list when the tab regains focus, at most every 30 s', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('a', { my_role: 'student' })] });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('a'));
    api.getClasses.mockResolvedValue({
      classes: [cls('a', { my_role: 'student' }), cls('b', { my_role: 'ta' })],
    });

    await regainFocus(); // the list was just loaded
    expect(api.getClasses).toHaveBeenCalledTimes(1);

    at(30);
    await regainFocus();
    await waitFor(() => expect(text('sidebar')).toBe('a,b'));
    expect(api.getClasses).toHaveBeenCalledTimes(2); // one request for both events
  });

  it('does not refresh a hidden tab', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('a', { my_role: 'student' })] });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('a'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      at(60);
      await regainFocus();
      expect(api.getClasses).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('counts a load still in flight toward the 30 s', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('a', { my_role: 'student' })] });
    renderProvider(<Controls />);
    await waitFor(() => expect(text('selected')).toBe('a'));
    const slow = deferred<unknown>();
    api.getClasses.mockReturnValueOnce(slow.promise);
    at(60);
    act(() => screen.getByText('refresh').click()); // My Classes' own refresh, still in flight
    await regainFocus();
    expect(api.getClasses).toHaveBeenCalledTimes(2);
    await act(async () => slow.resolve({ classes: [cls('a', { my_role: 'student' })] }));
  });

  it("keeps this tab's class when another tab picked a different one", async () => {
    preview.isPreviewing = true;
    api.getClasses.mockResolvedValue({
      classes: [cls('x', { my_role: 'instructor' }), cls('y', { my_role: 'ta' })],
    });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('x'));
    localStorage.setItem(SELECTED_KEY, 'y'); // another tab picks y
    api.getClasses.mockResolvedValue({
      classes: [cls('x', { my_role: 'instructor' }), cls('y', { my_role: 'ta' }), cls('z', { my_role: 'student' })],
    });
    at(60);
    await regainFocus();
    await waitFor(() => expect(screen.getByText('select z')).toBeInTheDocument()); // the refresh landed
    expect(text('selected')).toBe('x');
    expect(preview.exitPreview).not.toHaveBeenCalled();
  });

  it('keeps a class picked while a refresh is in flight', async () => {
    api.getClasses.mockResolvedValue({
      classes: [cls('x', { my_role: 'student' }), cls('y', { my_role: 'ta' })],
    });
    renderProvider();
    await waitFor(() => expect(text('selected')).toBe('x'));
    const slow = deferred<unknown>();
    api.getClasses.mockReturnValueOnce(slow.promise);
    at(60);
    await regainFocus();
    act(() => screen.getByText('select y').click());
    await act(async () => slow.resolve({ classes: [cls('x', { my_role: 'student' }), cls('y', { my_role: 'ta' })] }));
    expect(text('selected')).toBe('y');
  });

  it('keeps the same Class objects when a refresh finds nothing changed', async () => {
    api.getClasses.mockImplementation(async () => ({
      classes: [cls('x', { my_role: 'student', institution: UCSC }), cls('y', { my_role: 'ta' })],
    }));
    renderProvider(<IdentityLog />);
    await waitFor(() => expect(text('selected')).toBe('x'));
    localStorage.removeItem(SELECTED_KEY);
    at(60);
    await regainFocus();
    await waitFor(() => expect(localStorage.getItem(SELECTED_KEY)).toBe('x')); // landed and saved again
    expect(seenSelected.size).toBe(1);
    expect(seenLists.size).toBe(1);
  });

  it('ignores an older answer that lands after a newer one', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('x', { my_role: 'student' })] });
    renderProvider(<Controls />);
    await waitFor(() => expect(text('selected')).toBe('x'));
    const stale = deferred<unknown>();
    api.getClasses.mockReturnValueOnce(stale.promise);
    at(60);
    await regainFocus(); // a slow refresh goes out
    api.getClasses.mockResolvedValueOnce({
      classes: [cls('x', { my_role: 'student' }), cls('new', { my_role: 'instructor' })],
    });
    await act(async () => screen.getByText('refresh selecting new').click()); // after Create Class
    await waitFor(() => expect(text('selected')).toBe('new'));
    await act(async () => stale.resolve({ classes: [cls('x', { my_role: 'student' })] }));
    expect(text('selected')).toBe('new');
    expect(screen.getByText('select new')).toBeInTheDocument();
  });

  it('keeps a status change when a refresh already in flight answers the old status', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('x', { my_role: 'instructor' })] });
    api.updateClassStatus.mockResolvedValue({
      message: 'Class status updated',
      class: cls('x', { my_role: 'instructor', status: 'complete' }),
    });
    renderProvider(<Controls />);
    await waitFor(() => expect(text('statuses')).toBe('x:active'));
    const stale = deferred<unknown>();
    api.getClasses.mockReturnValueOnce(stale.promise);
    at(60);
    await regainFocus(); // a slow refresh goes out before the change
    await act(async () => screen.getByText('complete x').click());
    await waitFor(() => expect(text('statuses')).toBe('x:complete'));
    await act(async () => stale.resolve({ classes: [cls('x', { my_role: 'instructor' })] }));
    expect(text('statuses')).toBe('x:complete');
  });

  it('still selects the class that a superseded refresh asked for', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('x', { my_role: 'student' })] });
    renderProvider(<Controls />);
    await waitFor(() => expect(text('selected')).toBe('x'));
    const superseded = deferred<unknown>();
    api.getClasses.mockReturnValueOnce(superseded.promise);
    act(() => screen.getByText('refresh selecting new').click()); // Create Class asks for "new"...
    api.getClasses.mockResolvedValueOnce({
      classes: [cls('x', { my_role: 'student' }), cls('new', { my_role: 'instructor' })],
    });
    await act(async () => screen.getByText('refresh').click()); // ...while My Classes' timer refreshes
    await waitFor(() => expect(text('selected')).toBe('new'));
    await act(async () => superseded.resolve({ classes: [cls('x', { my_role: 'student' })] }));
    expect(text('selected')).toBe('new');
  });
});
