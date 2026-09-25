/** The Create Class modal with the real schools-list hook: only the API is mocked. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiInstitution } from '@/lib/api';

const UCSC: ApiInstitution = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc', email_domains: ['ucsc.edu'] };
const ISTINYE: ApiInstitution = { id: 'ist', name: 'İstinye University', slug: 'istinye', email_domains: ['istinye.edu.tr'] };

const api = vi.hoisted(() => ({ getInstitutions: vi.fn(), createClass: vi.fn(), uploadClassRoster: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ refreshClasses: vi.fn(() => Promise.resolve()), currentSchool: null }),
}));
vi.mock('@/features/app/components/Fields/DatePickerField', () => ({ default: () => null }));

import { clearInstitutionsCache } from '@/lib/institutions';
import CreateClassModal from '../CreateClassModal';

beforeEach(() => {
  clearInstitutionsCache();
  vi.resetAllMocks();
});

describe('CreateClassModal — a schools list that failed to load', () => {
  it('offers Try again, which asks again and shows the list once it loads', async () => {
    api.getInstitutions.mockResolvedValueOnce(null).mockResolvedValueOnce([UCSC, ISTINYE]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CreateClassModal isOpen onClose={() => {}} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/couldn.t load the list of schools/i)).toBeInTheDocument();
    expect(screen.queryByText(/reload the page/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('School')).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load the list of schools/i)).not.toBeInTheDocument();
    expect(api.getInstitutions).toHaveBeenCalledTimes(2);
  });
});
