import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContactPage from '../ContactPage';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/contact']}>
      <ContactPage />
    </MemoryRouter>,
  );

describe('ContactPage', () => {
  it('shows the contact card and the issue card in one grid', () => {
    const { container } = renderPage();
    const grid = container.querySelector('.contact-page__cards');
    expect(grid).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Get in touch' }).closest('.contact-page__cards')).toBe(grid);
    expect(screen.getByRole('heading', { level: 2, name: 'Submit an issue' }).closest('.contact-page__cards')).toBe(grid);
  });

  it('still sends the contact form to /api/contact', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Name'), 'Ann Lee');
    await user.type(screen.getByLabelText('Email'), 'ann@ucsc.edu');
    await user.type(screen.getByLabelText('Message'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Thanks! Your message is on its way');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/contact');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Ann Lee',
      email: 'ann@ucsc.edu',
      message: 'Hello',
      website: '',
    });
  });
});
