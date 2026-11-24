import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { ApiPersonProfile, ApiPersonSharedClass } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { OPEN_SETTINGS_EVENT } from '@/lib/openSettings';
import { cssRules } from '@/test/cssRules';
import PersonPage from '../pages/PersonPage';

const ctx = vi.hoisted(() => ({ selectedClassId: null as string | null, previewing: false }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: ctx.selectedClassId ? { id: ctx.selectedClassId } : null }),
}));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: ctx.previewing }) }));
vi.mock('@features/messages/hooks/useConversations', () => ({ useConversations: () => ({ conversations: [] }) }));
vi.mock('@/lib/api', () => ({ api: { getPersonProfile: vi.fn() } }));
const { api } = await import('@/lib/api');
const getPersonProfile = vi.mocked(api.getPersonProfile);

const cls = (over: Partial<ApiPersonSharedClass> = {}): ApiPersonSharedClass => ({
  class_id: 'c1',
  class_name: 'CSE 115A',
  term: 'Fall',
  year: 2026,
  status: 'active',
  institution: { id: 'i1', name: 'UC Santa Cruz' },
  role: 'student',
  viewer_role: 'student',
  team: {
    project_id: 'p1',
    name: 'Trailhead',
    project_role: 'product owner',
    members: [{ id: 'u2', name: 'Cy Diaz', image_url: null }],
  },
  ...over,
});

const bo = (over: Partial<ApiPersonProfile> = {}, person: Partial<ApiPersonProfile['person']> = {}): ApiPersonProfile => ({
  person: { id: 'u1', name: 'Bo Park', image_url: null, github: 'bopark', linkedin: null, ...person },
  shared: [cls()],
  is_self: false,
  ...over,
});

function Where() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="where">{location.pathname + location.search}</span>
      <button type="button" onClick={() => navigate('/app/people/u2')}>
        to u2
      </button>
    </>
  );
}

function show(path = '/app/people/u1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/people/:userId" element={<PersonPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const where = () => screen.getByTestId('where').textContent;
const name = (text: string) => screen.findByRole('heading', { level: 2, name: text });

describe('PersonPage', () => {
  beforeEach(() => {
    ctx.selectedClassId = null;
    ctx.previewing = false;
    getPersonProfile.mockReset();
  });

  it('shows the person, their classes and their team', async () => {
    getPersonProfile.mockResolvedValue(bo());
    show();
    await name('Bo Park');
    expect(getPersonProfile).toHaveBeenCalledWith('u1', expect.anything());
    expect(screen.getByText('UC Santa Cruz')).toBeInTheDocument();
    const tag = within(screen.getByRole('list', { name: 'Classes you share' })).getByText('CSE 115A · Student');
    expect(tag.closest('.gt-tag')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Trailhead' })).toHaveAttribute('href', '/app/projects/p1');
    expect(screen.getByText('Product Owner')).toBeInTheDocument();
    expect(screen.getByText('1 teammate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open team page, Trailhead' })).toHaveAttribute('href', '/app/projects/p1');
    const github = screen.getByRole('link', { name: 'Bo Park on GitHub' });
    expect(github).toHaveAttribute('href', 'https://github.com/bopark');
    expect(github).toHaveAttribute('rel', 'noopener noreferrer');
    expect(github).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: 'Message' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull();
    expect(screen.queryByText('For staff')).toBeNull();
    expect(screen.queryByText(/People who share a class with you/)).toBeNull();
  });

  it('Message opens a message to the person', async () => {
    getPersonProfile.mockResolvedValue(bo());
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Message' }));
    expect(where()).toBe('/app/messages/compose?to=u1&name=Bo+Park');
  });

  it('staff see the school email and the two links', async () => {
    getPersonProfile.mockResolvedValue(bo({ shared: [cls({ viewer_role: 'ta' })] }, { school_email: 'bo@ucsc.edu' }));
    show();
    await name('Bo Park');
    expect(screen.getByRole('link', { name: 'Email Bo Park at bo@ucsc.edu' })).toHaveAttribute(
      'href',
      'mailto:bo@ucsc.edu',
    );
    expect(screen.getByRole('heading', { level: 3, name: 'For staff' })).toBeInTheDocument();
    expect(screen.getByText('Only TAs and instructors of CSE 115A see this.')).toBeInTheDocument();
    const staff = within(screen.getByRole('complementary', { name: 'For staff' }));
    expect(staff.getByRole('link', { name: /Team board/ })).toHaveAttribute('href', '/app/projects/p1/board');
    expect(staff.getByRole('link', { name: /Documents/ })).toHaveAttribute(
      'href',
      '/app/projects/p1/board?view=documents',
    );
    expect(staff.getAllByRole('link')).toHaveLength(2);
  });

  it('names each class when staff links cover more than one', async () => {
    getPersonProfile.mockResolvedValue(
      bo({
        shared: [
          cls({ viewer_role: 'ta' }),
          cls({
            class_id: 'c2',
            class_name: 'CSE 115B',
            viewer_role: 'instructor',
            team: { project_id: 'p2', name: 'Echo', project_role: 'member', members: [] },
          }),
        ],
      }),
    );
    show();
    await name('Bo Park');
    expect(screen.getByText('Only TAs and instructors of these classes see this.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'CSE 115A, Trailhead' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'CSE 115B, Echo' })).toBeInTheDocument();
  });

  it('in preview, the school email and For staff are hidden', async () => {
    ctx.previewing = true;
    getPersonProfile.mockResolvedValue(bo({ shared: [cls({ viewer_role: 'instructor' })] }, { school_email: 'bo@ucsc.edu' }));
    show();
    await name('Bo Park');
    expect(screen.queryByText('bo@ucsc.edu')).toBeNull();
    expect(screen.queryByText('For staff')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('your own page offers Edit profile, which opens Settings on Profile', async () => {
    getPersonProfile.mockResolvedValue(bo({ is_self: true }, { school_email: 'bo@ucsc.edu' }));
    const opened = vi.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, opened);
    try {
      show();
      await name('Bo Park');
      expect(screen.getByRole('list', { name: 'Your classes' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
      expect(opened).toHaveBeenCalledTimes(1);
      expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ section: 'profile' });
    } finally {
      window.removeEventListener(OPEN_SETTINGS_EVENT, opened);
    }
    expect(
      screen.getByText(
        'People who share a class with you see this page. Only your TAs and instructors see your school email.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
    expect(screen.queryByText(/so teammates know who they are working with/)).toBeNull();
  });

  it('an empty own page nudges, and says when you are in no class', async () => {
    getPersonProfile.mockResolvedValue(bo({ is_self: true, shared: [] }, { github: null }));
    show();
    await name('Bo Park');
    expect(
      screen.getByText(/Add a photo, GitHub and LinkedIn so teammates know who they are working with\./),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit profile' })).toHaveLength(2);
    expect(screen.getByText('You’re not in a class yet.')).toBeInTheDocument();
    expect(screen.getByText('No GitHub or LinkedIn yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Your classes' })).toBeNull();
  });

  it('a person with no name reads "No name yet", and their links are named without one', async () => {
    getPersonProfile.mockResolvedValue(bo({}, { name: '' }));
    show();
    await name('No name yet');
    expect(screen.getByRole('link', { name: 'GitHub profile' })).toHaveAttribute('href', 'https://github.com/bopark');
  });

  it('shows no link for a value that is not a handle on that site', async () => {
    getPersonProfile.mockResolvedValue(bo({}, { github: 'javascript:alert(1)', linkedin: 'https://evil.example/in/bo' }));
    show();
    await name('Bo Park');
    expect(screen.getByText('No links added.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Links' })).toBeNull();
  });

  it('a TA and the instructor get their own team line', async () => {
    getPersonProfile.mockResolvedValue(
      bo({
        shared: [
          cls({ class_id: 'a', role: 'ta', team: null }),
          cls({ class_id: 'b', role: 'instructor', team: null }),
          cls({ class_id: 'c', role: 'student', team: null }),
        ],
      }),
    );
    show();
    await name('Bo Park');
    expect(screen.getByText('Teaching assistant in this class.')).toBeInTheDocument();
    expect(screen.getByText('Teaches this class.')).toBeInTheDocument();
    expect(screen.getByText('Not on a team in this class yet.')).toBeInTheDocument();
  });

  it('lists the selected class first, and the schools once each', async () => {
    ctx.selectedClassId = 'c2';
    getPersonProfile.mockResolvedValue(
      bo({
        shared: [
          cls(),
          cls({
            class_id: 'c2',
            class_name: 'CS 157A',
            institution: { id: 'i2', name: 'San José State' },
            team: null,
          }),
        ],
      }),
    );
    show();
    await name('Bo Park');
    // The schools follow the classes' order.
    expect(screen.getByText('San José State · UC Santa Cruz')).toBeInTheDocument();
    const cards = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(cards).toEqual(['CS 157A', 'CSE 115A']);
    expect(screen.getAllByText('Fall 2026 · Student')).toHaveLength(2);
  });

  it.each([404, 422])('a %i is the not-visible state', async (status) => {
    getPersonProfile.mockRejectedValue(new ApiError(status, 'Profile not found', 'Request failed'));
    show();
    expect(await screen.findByRole('heading', { level: 2, name: 'You can’t see this person' })).toBeInTheDocument();
    expect(screen.getByText('A profile is visible to people who share a class with its owner.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/app/home');
  });

  it('any other failure offers Try again, which asks again', async () => {
    getPersonProfile.mockRejectedValueOnce(new ApiError(500, 'Internal server error', 'Request failed')).mockResolvedValueOnce(bo());
    show();
    expect(await screen.findByRole('heading', { level: 2, name: 'Couldn’t load this profile' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await name('Bo Park');
    expect(getPersonProfile).toHaveBeenCalledTimes(2);
  });

  it('is busy while loading', () => {
    getPersonProfile.mockReturnValue(new Promise(() => {}));
    const { container } = show();
    expect(container.querySelector('.gt-profile')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading profile');
  });

  it('shows the second person when the first answer arrives late', async () => {
    let answerFirst: (profile: ApiPersonProfile) => void = () => {};
    getPersonProfile.mockImplementation((userId: string) =>
      userId === 'u1'
        ? new Promise<ApiPersonProfile>((resolve) => {
            answerFirst = resolve;
          })
        : Promise.resolve(bo({}, { id: 'u2', name: 'Cy Diaz' })),
    );
    show();
    await userEvent.click(screen.getByRole('button', { name: 'to u2' }));
    await name('Cy Diaz');
    await act(async () => {
      answerFirst(bo());
    });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Cy Diaz');
    expect(screen.queryByText('Bo Park')).toBeNull();
  });

  it('keeps a long class name or link inside the card: the list items may shrink', () => {
    // jsdom lays nothing out. Without these, a long tag or address makes the page scroll sideways.
    for (const selector of ['.gt-profile-header__roles li', '.gt-profile-header__links li']) {
      const [rule] = cssRules(selector);
      expect(rule?.getPropertyValue('min-width')).toBe('0px');
      expect(rule?.getPropertyValue('max-width')).toBe('100%');
    }
  });

  it('shows the loading state again for the next person, not the last one', async () => {
    getPersonProfile.mockImplementation((userId: string) =>
      userId === 'u1' ? Promise.resolve(bo()) : new Promise<ApiPersonProfile>(() => {}),
    );
    const { container } = show();
    await name('Bo Park');
    await userEvent.click(screen.getByRole('button', { name: 'to u2' }));
    expect(container.querySelector('.gt-profile')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Bo Park')).toBeNull();
  });
});
