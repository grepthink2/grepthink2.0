import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useMessageUser } from '../useMessageUser';

const inbox = vi.hoisted(() => ({ conversations: [] as { id: string; other_user: { id: string } | null }[] }));
vi.mock('../useConversations', () => ({ useConversations: () => ({ conversations: inbox.conversations }) }));

function Probe({ name }: { name?: string | null }) {
  const message = useMessageUser();
  const location = useLocation();
  return (
    <>
      <button type="button" onClick={() => message('u1', name)}>
        Message
      </button>
      <output>{location.pathname + location.search}</output>
    </>
  );
}

const open = async (name?: string | null) => {
  render(<Probe name={name} />, { wrapper: MemoryRouter });
  await userEvent.click(screen.getByRole('button', { name: 'Message' }));
  return screen.getByRole('status').textContent;
};

describe('useMessageUser', () => {
  beforeEach(() => {
    inbox.conversations = [];
  });

  it('opens the conversation the two already have', async () => {
    inbox.conversations = [
      { id: 'team', other_user: null },
      { id: 'dm7', other_user: { id: 'u1' } },
    ];
    expect(await open('Bo Park')).toBe('/app/messages/dm7');
  });

  it('starts a new message to the person, by name, when they have none', async () => {
    expect(await open('Bo Park')).toBe('/app/messages/compose?to=u1&name=Bo+Park');
  });

  it('leaves the name out when there is none', async () => {
    expect(await open(null)).toBe('/app/messages/compose?to=u1');
  });
});
