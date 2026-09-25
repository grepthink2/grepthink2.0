import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LandingPage from '../LandingPage';

const originalScrollIntoView = Element.prototype.scrollIntoView;
let scrolledTo: Element[] = [];

beforeEach(() => {
  scrolledTo = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolledTo.push(this);
  };
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const renderAt = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LandingPage />
    </MemoryRouter>,
  );

describe('LandingPage', () => {
  it('shows the three feature bands after the overview, in order', () => {
    const { container } = renderAt();
    const ids = Array.from(container.querySelectorAll('section[id]')).map((section) => section.id);
    expect(ids).toEqual(['solutions', 'scrum-board', 'messaging', 'project-assistant']);
    expect(screen.getByRole('heading', { level: 2, name: 'Run every sprint from one board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'One inbox for your team and course staff' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'A board that keeps up with your code' })).toBeInTheDocument();
  });

  it('badges scrum and messaging as new and the assistant as coming soon', () => {
    renderAt();
    expect(within(screen.getByRole('region', { name: 'Run every sprint from one board' })).getByText('New')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'One inbox for your team and course staff' })).getByText('New')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'A board that keeps up with your code' })).getByText('Soon')).toBeInTheDocument();
  });

  it('keeps every stage out of the accessibility tree', () => {
    const { container } = renderAt();
    const stages = container.querySelectorAll('.spotlight__stage');
    expect(stages).toHaveLength(3);
    stages.forEach((stage) => expect(stage).toHaveAttribute('aria-hidden', 'true'));
  });

  it('ends with the closing band', () => {
    renderAt();
    const band = screen.getByRole('region', { name: 'Ready to run your class on grepthink?' });
    expect(within(band).getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/select');
    expect(within(band).getByRole('link', { name: 'Talk to us' })).toHaveAttribute('href', '/contact');
  });

  it('links the header and footer to the bands', () => {
    renderAt();
    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/#scrum-board');
    const footer = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footer).getByRole('link', { name: 'Solutions' })).toHaveAttribute('href', '/#solutions');
    expect(within(footer).getByRole('link', { name: 'Scrum board' })).toHaveAttribute('href', '/#scrum-board');
    expect(within(footer).getByRole('link', { name: 'Messaging' })).toHaveAttribute('href', '/#messaging');
    expect(within(footer).getByRole('link', { name: 'Project assistant' })).toHaveAttribute('href', '/#project-assistant');
  });

  it('scrolls to the section named in the URL hash', () => {
    renderAt('/#messaging');
    expect(scrolledTo).toEqual([document.getElementById('messaging')]);
  });
});
