import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NewConversationSearch } from '../components/NewConversationSearch';

vi.mock('@/lib/api', () => ({ api: { getContacts: vi.fn() } }));
const { api } = await import('@/lib/api');

describe('NewConversationSearch', () => {
  it('draws each result’s avatar hidden beside the printed name, and "?" for a contact with no name or email', async () => {
    vi.mocked(api.getContacts).mockResolvedValue({
      contacts: [
        { id: 'u1', name: 'Sam Lee', email: 'sam@ucsc.edu', image_url: 'https://img.example/sam.png' },
        { id: 'u2', name: null, email: null },
      ],
    });
    render(<MemoryRouter><NewConversationSearch /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));

    // A shown avatar would add its name to the result's: "Sam Lee Sam Lee".
    const sam = await screen.findByRole('button', { name: 'Sam Lee' });
    const photo = sam.querySelector('.gt-avatar');
    expect(photo?.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('aria-hidden', 'true');
    expect(photo).toHaveClass('gt-avatar--md');

    const nobody = screen.getByRole('button', { name: 'Unknown' });
    expect(nobody.querySelector('.gt-avatar')).toHaveTextContent(/^\?$/);
  });
});
