import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SectionLink from '../components/SectionLink';

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

// No LandingPage here, so nothing but the link itself can scroll.
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <section id="messaging">Messaging band</section>
      <SectionLink sectionId="messaging">Messaging</SectionLink>
    </MemoryRouter>,
  );

describe('SectionLink', () => {
  it('points at the section on the landing page from any page', () => {
    renderAt('/contact');
    expect(screen.getByRole('link', { name: 'Messaging' })).toHaveAttribute('href', '/#messaging');
  });

  it('scrolls to the section when the page is already at that link', async () => {
    renderAt('/#messaging');
    await userEvent.click(screen.getByRole('link', { name: 'Messaging' }));
    expect(scrolledTo).toEqual([document.getElementById('messaging')]);
  });

  it('leaves every other navigation to the router', async () => {
    renderAt('/#scrum-board');
    await userEvent.click(screen.getByRole('link', { name: 'Messaging' }));
    expect(scrolledTo).toEqual([]);
  });
});
