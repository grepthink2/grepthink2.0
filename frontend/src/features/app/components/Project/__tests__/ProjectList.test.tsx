import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProjectList, { type UiProject } from '../ProjectList';

const trailhead: UiProject = {
  id: 'p-trailhead',
  name: 'Trailhead',
  students: 3,
  poName: 'Ana Lopez',
  poEmail: 'alopez@ucsc.edu',
  smName: 'Unassigned',
  smEmail: '',
  sentiment: 'neutral',
};

// A Product Owner with no name on their profile: the backend sends their address as the name.
const beacon: UiProject = {
  ...trailhead,
  id: 'p-beacon',
  name: 'Beacon',
  poName: 'beacon.po@ucsc.edu',
  poEmail: 'beacon.po@ucsc.edu',
};

/** The desktop table's row for `name` (the mobile cards render the same projects outside the table). */
function tableRow(name: string) {
  render(<ProjectList projects={[trailhead, beacon]} loading={false} error={null} />);
  return screen.getAllByRole('row').find((row) => within(row).queryByText(name))!;
}

describe('ProjectList', () => {
  it("shows a Product Owner's name above their mail link", () => {
    const row = tableRow('Trailhead');

    expect(within(row).getByText('Ana Lopez')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'alopez@ucsc.edu' })).toHaveAttribute(
      'href',
      'mailto:alopez@ucsc.edu',
    );
  });

  it('shows the address of a Product Owner with no name once, as the mail link', () => {
    const row = tableRow('Beacon');

    expect(within(row).getAllByText('beacon.po@ucsc.edu')).toHaveLength(1);
    expect(within(row).getByRole('link', { name: 'beacon.po@ucsc.edu' })).toHaveAttribute(
      'href',
      'mailto:beacon.po@ucsc.edu',
    );
  });

  it('shows Unassigned and a dash when a team has no Scrum Master', () => {
    const row = tableRow('Trailhead');

    expect(within(row).getByText('Unassigned')).toBeInTheDocument();
    expect(within(row).getByText('—')).toBeInTheDocument();
  });
});
