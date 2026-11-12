import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cssRules } from '@/test/cssRules';

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

  it('draws the loading rows on the week’s bordered surface, below room for its toolbar, so the card does not move', async () => {
    vi.doMock('../components/HomeSchedule', () => ({ default: () => <p>The week</p> }));
    const { HomeScheduleCard } = await import('../components/HomeScheduleCard');
    render(<HomeScheduleCard classId="c1" schoolZone="Etc/GMT+8" />);
    const rows = screen.getByRole('status', { name: 'Loading schedule' });
    expect(rows.parentElement).toHaveClass('gt-sched-home__days');
    expect(rows.parentElement?.previousElementSibling).toHaveClass('gt-sched-home__toolbar');
    expect(rows.querySelectorAll('.gt-sched__skeleton')).toHaveLength(5);
    const [days] = cssRules('.gt-sched-home__days');
    expect(days.getPropertyValue('border')).toBe('1px solid var(--gt-border-subtle)');
    expect(await screen.findByText('The week')).toBeInTheDocument();
  });

  it('recovers from a render error when the class changes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('../components/HomeSchedule', () => ({
      default: ({ classId }: { classId: string }) => {
        if (classId === 'broken') throw new Error('render failed');
        return <p>The week of {classId}</p>;
      },
    }));
    const { HomeScheduleCard } = await import('../components/HomeScheduleCard');
    const { rerender } = render(<HomeScheduleCard classId="broken" schoolZone="Etc/GMT+8" />);
    expect(await screen.findByText('Couldn’t load your schedule. Refresh the page to try again.')).toBeInTheDocument();
    rerender(<HomeScheduleCard classId="c2" schoolZone="Etc/GMT+8" />);
    expect(await screen.findByText('The week of c2')).toBeInTheDocument();
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
