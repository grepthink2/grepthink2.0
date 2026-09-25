import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import Spotlight from '../components/spotlights/Spotlight';

type Props = ComponentProps<typeof Spotlight>;

function renderBand(overrides: Partial<Props> = {}) {
  const props: Props = {
    id: 'demo',
    label: 'Demo feature',
    badge: 'new',
    title: 'Say it with',
    accent: 'one line',
    lead: 'A short paragraph.',
    points: [{ icon: Bell, text: 'First point' }],
    textSide: 'left',
    children: <div data-testid="stage-child" />,
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <Spotlight {...props} />
    </MemoryRouter>,
  );
}

describe('Spotlight', () => {
  it('is a region named by its heading, with the accent inside the heading', () => {
    renderBand();
    const band = screen.getByRole('region', { name: 'Say it with one line' });
    expect(band).toHaveAttribute('id', 'demo');
    expect(within(band).getByRole('heading', { level: 2 })).toHaveTextContent('Say it with one line');
    expect(within(band).getByRole('listitem')).toHaveTextContent('First point');
  });

  it('shows the badge that the config asks for', () => {
    renderBand({ badge: 'soon' });
    const band = screen.getByRole('region');
    expect(within(band).getByText('Soon')).toBeInTheDocument();
    expect(within(band).queryByText('New')).not.toBeInTheDocument();
  });

  it('shows no badge when the feature has none', () => {
    renderBand({ badge: null });
    const band = screen.getByRole('region');
    expect(within(band).queryByText('New')).not.toBeInTheDocument();
    expect(within(band).queryByText('Soon')).not.toBeInTheDocument();
  });

  it('hides the decorative stage from assistive tech and keeps focus out of it', () => {
    renderBand();
    const stage = screen.getByTestId('stage-child').parentElement;
    expect(stage).toHaveAttribute('aria-hidden', 'true');
    expect(stage).toHaveAttribute('inert');
  });

  it('renders the staff note and the link when given', () => {
    renderBand({
      aside: { title: 'For TAs and instructors', text: 'Staff detail.' },
      cta: { label: 'Want early access? Get in touch', to: '/contact' },
    });
    expect(screen.getByText('For TAs and instructors')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Want early access\? Get in touch/ })).toHaveAttribute('href', '/contact');
  });

  it('puts the text on the right when asked', () => {
    renderBand({ textSide: 'right' });
    expect(screen.getByRole('region')).toHaveClass('spotlight--text-right');
  });
});
