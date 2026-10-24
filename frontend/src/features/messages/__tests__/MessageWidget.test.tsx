import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ApiConversationSummary } from '@/lib/api';
import { MessageWidget } from '../components/MessageWidget';

const inbox = vi.hoisted(() => ({ conversations: [] as ApiConversationSummary[], loading: false }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('../hooks/useConversations', () => ({ useConversations: () => inbox }));
vi.mock('../hooks/useUnreadTotal', () => ({ useUnreadTotal: () => 0 }));
// The open conversation's thread and the row menus reach for the inbox's live data; the header is the subject here.
vi.mock('../components/ConversationThread', () => ({ ConversationThread: () => null }));
vi.mock('../components/ConversationMenu', () => ({ ConversationMenu: () => null }));
vi.mock('../components/NewConversationSearch', () => ({ NewConversationSearch: () => null }));

const dm = (id: string, otherUser: ApiConversationSummary['other_user']): ApiConversationSummary => ({
  id, type: 'dm', project_id: null, team_name: null, participants: [], other_user: otherUser,
  last_message: null, unread_count: 0, other_user_last_read_at: null, can_send: true, last_message_at: null,
});

describe('MessageWidget', () => {
  it('draws the open conversation’s avatar hidden beside its title, and "?" for a DM with no peer', async () => {
    inbox.conversations = [dm('c1', { id: 'u2', email: 'sam@ucsc.edu', name: 'Sam Lee' }), dm('c2', null)];
    const { container } = render(<MemoryRouter initialEntries={['/app']}><MessageWidget /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Open messages' }));
    // The widget's inbox rows take the md size.
    expect(container.querySelector('.messages-list__item .gt-avatar')).toHaveClass('gt-avatar--md');

    await userEvent.click(screen.getByText('Sam Lee'));
    const avatar = () => container.querySelector('.message-widget__header .gt-avatar');
    expect(avatar()).toHaveTextContent('SL');
    expect(avatar()).toHaveAttribute('aria-hidden', 'true');
    expect(avatar()).toHaveClass('gt-avatar--md');
    expect(screen.queryByRole('img')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Back to inbox' }));
    await userEvent.click(screen.getByText('Unknown'));
    expect(avatar()).toHaveTextContent(/^\?$/);
  });
});
