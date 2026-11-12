import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('../components/HomeSchedule');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('HomeScheduleCard', () => {
  it('shows loading rows while the week’s code loads, then the week', async () => {
    vi.doMock('../components/HomeSchedule', () => ({ default: ({ classId }: { classId: string }) => <p>The week of {classId}</p> }));
    const { HomeScheduleCard } = await import('../components/HomeScheduleCard');
    render(<HomeScheduleCard classId="c1" schoolZone="Etc/GMT+8" />);
    expect(screen.getByRole('status', { name: 'Loading schedule' })).toBeInTheDocument();
    expect(await screen.findByText('The week of c1')).toBeInTheDocument();
  });

  it('says so in the card, not across the page, when the week’s code fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('../components/HomeSchedule', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const { HomeScheduleCard } = await import('../components/HomeScheduleCard');
    render(<HomeScheduleCard classId="c1" schoolZone="Etc/GMT+8" />);
    expect(await screen.findByText('Couldn’t load your schedule. Refresh the page to try again.')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
