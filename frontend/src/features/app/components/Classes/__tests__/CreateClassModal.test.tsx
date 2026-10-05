import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/features/app/components/Fields/DatePickerField', () => ({
  default: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('2026-09-28')}>
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
}

const submit = () => screen.getByRole('button', { name: 'Create Class' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.createClass).mockResolvedValue({ message: 'ok', class: { id: 'new', name: 'SE 301', created_by: 'me', created_at: '' } });
  state.institutions = undefined;
  state.currentSchool = null;
  state.classes = [];
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
