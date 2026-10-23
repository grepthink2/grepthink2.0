import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ApiConversationSummary } from '@/lib/api';
import { ConversationThread } from '../components/ConversationThread';

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/lib/api', () => ({ api: { markConversationRead: vi.fn(() => Promise.resolve()), sendMessage: vi.fn() } }));
// An empty thread that has loaded, and an inbox with nothing to refetch; stable across renders.
vi.mock('../hooks/useConversationMessages', () => {
  const thread = {
    messages: [], loading: false, loadingOlder: false, hasMore: false, loadOlder: vi.fn(),
    addOptimisticMessage: vi.fn(), confirmOptimistic: vi.fn(), dropOptimistic: vi.fn(),
  };
  return { useConversationMessages: () => thread };
});
vi.mock('../hooks/useConversations', () => {
  const inbox = { refetch: vi.fn(), optimisticMarkRead: vi.fn() };
  return { useConversations: () => inbox };
});
vi.mock('../components/ConversationMenu', () => ({ ConversationMenu: () => null }));

const dm = (otherUser: ApiConversationSummary['other_user']): ApiConversationSummary => ({
  id: 'c1', type: 'dm', project_id: null, team_name: null, participants: [], other_user: otherUser,
  last_message: null, unread_count: 0, other_user_last_read_at: null, can_send: true, last_message_at: null,
});

describe('ConversationThread header', () => {
  it('draws the avatar hidden beside the title, and "?" for a DM with no peer', () => {
    const { container, rerender } = render(
      <ConversationThread conversation={dm({ id: 'u2', email: 'sam@ucsc.edu', name: 'Sam Lee', image_url: 'https://img.example/sam.png' })} />,
    );
    expect(screen.getByRole('heading', { name: 'Sam Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    const photo = container.querySelector('.messages-thread__header .gt-avatar');
    expect(photo?.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('aria-hidden', 'true');
    expect(photo).toHaveClass('gt-avatar--lg');

    rerender(<ConversationThread conversation={dm(null)} />);
    expect(screen.getByRole('heading', { name: 'Unknown' })).toBeInTheDocument();
    expect(container.querySelector('.messages-thread__header .gt-avatar')).toHaveTextContent(/^\?$/);
  });
});
