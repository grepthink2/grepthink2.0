import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Hero from '../components/Hero';

const renderHero = (props: Parameters<typeof Hero>[0] = {}) =>
  render(
    <MemoryRouter>
      <Hero {...props} />
    </MemoryRouter>,
  );

describe('Hero', () => {
  it('announces the launch with a pill that jumps to the scrum board band', () => {
    renderHero();
    const pill = screen.getByRole('link', { name: /New: Scrum boards and team channels/ });
    expect(pill).toHaveAttribute('href', '/#scrum-board');
    expect(screen.queryByText('For instructors and student teams')).not.toBeInTheDocument();
    expect(screen.getByText(/helps instructors and student teams form balanced teams/)).toBeInTheDocument();
  });

  it('goes back to the plain eyebrow and subtitle without an announcement', () => {
    renderHero({ announcement: null });
    expect(screen.queryByRole('link', { name: /^New:/ })).not.toBeInTheDocument();
    expect(screen.getByText('For instructors and student teams')).toBeInTheDocument();
    expect(screen.getByText(/grepthink helps classes form balanced teams/)).toBeInTheDocument();
  });
});
