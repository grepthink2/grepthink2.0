import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiInstitution } from '@/lib/api';

const UCSC: ApiInstitution = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc', email_domains: ['ucsc.edu'] };
const ISTINYE: ApiInstitution = { id: 'ist', name: 'İstinye University', slug: 'istinye', email_domains: ['istinye.edu.tr'] };
const AT_UCSC = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };
const AT_ISTINYE = { id: 'ist', name: 'İstinye University', slug: 'istinye' };

type School = typeof AT_UCSC;
type ClassRow = { id: string; my_role: 'instructor' | 'ta' | 'student'; institution: School | null };

const state = vi.hoisted(() => ({
  institutions: undefined as ApiInstitution[] | null | undefined,
  currentSchool: null as School | null,
  classes: [] as ClassRow[],
}));
// The day each mocked picker picks when clicked: the first week of term, and the last day of classes.
const picks = vi.hoisted(() => ({ start: '', end: '' }));

vi.mock('@/lib/institutions', () => ({
  useInstitutionsWithRetry: () => ({ institutions: state.institutions, retry: vi.fn() }),
}));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({
    refreshClasses: vi.fn(() => Promise.resolve()),
    currentSchool: state.currentSchool,
    classes: state.classes,
  }),
}));
vi.mock('@/lib/api', () => ({ api: { createClass: vi.fn(), uploadClassRoster: vi.fn() } }));
// The real picker is a calendar popover; a button that picks a date is enough here.
vi.mock('@/components/DatePickerField/DatePickerField', () => ({
  DatePickerField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange(label === 'Last Day of Classes' ? picks.end : picks.start)}>
      {label}
    </button>
  ),
}));

import { api } from '@/lib/api';
import CreateClassModal from '../CreateClassModal';

function renderModal() {
  render(
    <MemoryRouter>
      <CreateClassModal isOpen onClose={() => {}} />
    </MemoryRouter>,
  );
}

async function fillCourse(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('e.g., CSE 115A'), 'SE 301');
  await user.click(screen.getByRole('button', { name: 'First Week of Term' }));
  await user.click(screen.getByRole('button', { name: 'Last Day of Classes' }));
}

const submit = () => screen.getByRole('button', { name: 'Create Class' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.createClass).mockResolvedValue({ message: 'ok', class: { id: 'new', name: 'SE 301', created_by: 'me', created_at: '' } });
  state.institutions = undefined;
  state.currentSchool = null;
  state.classes = [];
  picks.start = '2026-09-28';
  picks.end = '2026-09-28'; // the last day may be the first day: a one-day course is still valid
});

describe('CreateClassModal — school', () => {
  it('asks for a school when there are several and sends the one picked', async () => {
    const user = userEvent.setup();
    state.institutions = [UCSC, ISTINYE];
    renderModal();
    await fillCourse(user);

    const school = screen.getByLabelText('School');
    expect(school).toHaveValue('');
    expect(submit()).toBeDisabled();

    await user.selectOptions(school, 'ist');
    await user.click(submit());
    expect(api.createClass).toHaveBeenCalledWith(expect.objectContaining({ name: 'SE 301', institution_id: 'ist' }));
  });

  it('does not default to the current school when you only TA or study there', () => {
    // Scott with a UCSC class selected: a TA there, the instructor only at İstinye.
    state.institutions = [UCSC, ISTINYE];
    state.currentSchool = AT_UCSC;
    state.classes = [
      { id: 'cse115c', my_role: 'ta', institution: AT_UCSC },
      { id: 'cse101', my_role: 'student', institution: AT_UCSC },
      { id: 'se301', my_role: 'instructor', institution: AT_ISTINYE },
    ];
    renderModal();
    expect(screen.getByLabelText('School')).toHaveValue('');
    expect(submit()).toBeDisabled();
  });

  it('defaults to the current school when you teach a class there', () => {
    state.institutions = [UCSC, ISTINYE];
    state.currentSchool = AT_ISTINYE;
    state.classes = [
      { id: 'cse115c', my_role: 'ta', institution: AT_UCSC },
      { id: 'se301', my_role: 'instructor', institution: AT_ISTINYE },
    ];
    renderModal();
    expect(screen.getByLabelText('School')).toHaveValue('ist');
  });

  it('defaults to the only school, even one where you do not teach', () => {
    state.institutions = [UCSC];
    state.currentSchool = AT_UCSC;
    state.classes = [{ id: 'cse115c', my_role: 'ta', institution: AT_UCSC }];
    renderModal();
    expect(screen.getByLabelText('School')).toHaveValue('ucsc');
  });

  it('waits for the list of schools before it can create a class', async () => {
    const user = userEvent.setup();
    renderModal();
    await fillCourse(user);
    expect(screen.getByText('Loading schools…')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('says so when the list could not be loaded, and keeps the form closed to submission', async () => {
    const user = userEvent.setup();
    state.institutions = null;
    renderModal();
    await fillCourse(user);
    expect(screen.getByText(/couldn.t load the list of schools/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('School')).not.toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('with no schools yet, shows no field and creates the class without one', async () => {
    const user = userEvent.setup();
    state.institutions = [];
    renderModal();
    await fillCourse(user);
    expect(screen.queryByLabelText('School')).not.toBeInTheDocument();

    await user.click(submit());
    expect(api.createClass).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.createClass).mock.calls[0][0].institution_id).toBeUndefined();
  });
});

describe('CreateClassModal — last day of classes', () => {
  const nameBox = () => screen.getByPlaceholderText('e.g., CSE 115A');

  beforeEach(() => {
    state.institutions = []; // no school to pick
  });

  it('asks for it with a hint, and creates the class with the day picked', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByText('Before finals week')).toBeInTheDocument();
    await fillCourse(user);
    await user.click(submit());
    expect(api.createClass).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SE 301', start_date: '2026-09-28', end_date: '2026-09-28' }),
    );
  });

  it('keeps Create Class disabled until the day is set', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(nameBox(), 'SE 301');
    await user.click(screen.getByRole('button', { name: 'First Week of Term' }));
    expect(submit()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Last Day of Classes' }));
    expect(submit()).toBeEnabled();
  });

  it("refuses a day before the first week of term, says why, and creates nothing until it's fixed", async () => {
    const user = userEvent.setup();
    picks.end = '2026-09-21';
    renderModal();
    await fillCourse(user);
    await user.click(submit());
    expect(await screen.findByText("The last day of classes can't be before the first week of term")).toBeInTheDocument();
    expect(api.createClass).not.toHaveBeenCalled();

    picks.end = '2026-12-04';
    await user.click(screen.getByRole('button', { name: 'Last Day of Classes' }));
    await user.click(submit());
    expect(api.createClass).toHaveBeenCalledWith(expect.objectContaining({ start_date: '2026-09-28', end_date: '2026-12-04' }));
    expect(screen.queryByText(/can't be before the first week of term/)).not.toBeInTheDocument();
  });

  it("refuses a day more than a year after the first week of term, says why, and creates nothing until it's fixed", async () => {
    const user = userEvent.setup();
    // The first week is Sep 28, 2026. Oct 4, 2027 is 371 days on: past week 53, so a mistyped year.
    picks.end = '2027-10-04';
    renderModal();
    await fillCourse(user);
    await user.click(submit());
    expect(
      await screen.findByText('The last day of classes must be within a year of the first week of term'),
    ).toBeInTheDocument();
    expect(api.createClass).not.toHaveBeenCalled();

    // Oct 3, 2027 is 370 days on, the end of week 53: the latest day the API takes.
    picks.end = '2027-10-03';
    await user.click(screen.getByRole('button', { name: 'Last Day of Classes' }));
    await user.click(submit());
    expect(api.createClass).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: '2026-09-28', end_date: '2027-10-03' }),
    );
    expect(screen.queryByText(/within a year of the first week of term/)).not.toBeInTheDocument();
  });

  it('asks for the day again for the next class', async () => {
    const user = userEvent.setup();
    renderModal();
    await fillCourse(user);
    await user.click(submit());
    await waitFor(() => expect(nameBox()).toHaveValue('')); // the form reset after the class was created

    await user.type(nameBox(), 'SE 302');
    await user.click(screen.getByRole('button', { name: 'First Week of Term' }));
    expect(submit()).toBeDisabled();
  });
});

describe('CreateClassModal — Tasks - External link', () => {
  const linkBox = () => screen.getByLabelText(/Tasks - External link/i);

  beforeEach(() => {
    state.institutions = []; // no school to pick
  });
  afterEach(() => vi.restoreAllMocks()); // the console spies

  it('creates the class with the link as typed, less surrounding spaces', async () => {
    const user = userEvent.setup();
    renderModal();
    await fillCourse(user);
    await user.type(linkBox(), '  https://job191.yeterly.ai/ ');
    await user.click(submit());
    expect(api.createClass).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SE 301', external_tasks_url: 'https://job191.yeterly.ai/' }),
    );
  });

  it('creates the class without a link when the box is left empty', async () => {
    const user = userEvent.setup();
    renderModal();
    await fillCourse(user);
    await user.click(submit());
    expect(api.createClass).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.createClass).mock.calls[0][0].external_tasks_url).toBeUndefined();
  });

  it('refuses a link that is not a full web address, says why, and creates nothing', async () => {
    const user = userEvent.setup();
    renderModal();
    await fillCourse(user);
    await user.type(linkBox(), 'job191.yeterly.ai');
    await user.click(submit());
    expect(api.createClass).not.toHaveBeenCalled();
    expect(linkBox()).toHaveAttribute('aria-invalid', 'true');
    expect(linkBox()).toHaveAccessibleDescription(/https:\/\//);
  });

  it('points at the link box, not an older error, when the link is what blocks the class', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.createClass).mockRejectedValueOnce(new Error('Failed to create class'));
    renderModal();
    await fillCourse(user);
    await user.click(submit());
    expect(await screen.findByText('Failed to create class')).toBeInTheDocument();

    await user.type(linkBox(), 'job191.yeterly.ai');
    await user.click(submit());
    expect(screen.queryByText('Failed to create class')).not.toBeInTheDocument();
    expect(linkBox()).toHaveFocus();
    expect(api.createClass).toHaveBeenCalledTimes(1);
  });

  it('shows the API refusing the link at the link box, not as a bare status code', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.createClass).mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status 422'), {
        status: 422,
        detail: [{ type: 'value_error', loc: ['body', 'external_tasks_url'], msg: 'Value error, refused' }],
      }),
    );
    renderModal();
    await fillCourse(user);
    await user.type(linkBox(), 'https://job191.yeterly.ai/');
    await user.click(submit());
    await waitFor(() => expect(linkBox()).toHaveAttribute('aria-invalid', 'true'));
    expect(linkBox()).toHaveAccessibleDescription(/can't be used/);
    expect(linkBox()).toHaveFocus();
    expect(screen.queryByText('Request failed with status 422')).not.toBeInTheDocument();

    await user.type(linkBox(), 'x'); // editing the link clears the refusal
    expect(linkBox()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('flags a bad link once you leave the box, and clears the flag once it is fixed', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(linkBox(), 'javascript:alert(1)');
    expect(linkBox()).not.toHaveAttribute('aria-invalid', 'true'); // not while still typing
    await user.tab();
    expect(linkBox()).toHaveAttribute('aria-invalid', 'true');

    await user.clear(linkBox());
    await user.type(linkBox(), 'https://job191.yeterly.ai/');
    expect(linkBox()).not.toHaveAttribute('aria-invalid', 'true');
  });
});
