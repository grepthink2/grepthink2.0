import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiConversationSummary } from '@/lib/api';

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
// Both reach for app context (the inbox hook, the router) this list does not need.
vi.mock('../components/ConversationMenu', () => ({ ConversationMenu: () => null }));
vi.mock('../components/NewConversationSearch', () => ({ NewConversationSearch: () => null }));

import { ConversationList } from '../components/ConversationList';

function conversation(overrides: Partial<ApiConversationSummary>): ApiConversationSummary {
  return {
    id: 'c1',
    type: 'dm',
    project_id: null,
    team_name: null,
    participants: [],
    other_user: null,
    last_message: null,
    unread_count: 0,
    other_user_last_read_at: null,
    can_send: true,
    last_message_at: '2026-10-11T10:00:00Z',
    ...overrides,
  };
}

function message(sender_id: string, body: string): ApiConversationSummary['last_message'] {
  return { id: 'm1', sender_id, body, created_at: '2026-10-11T10:00:00Z' };
}

/** The name row and the second row of the list item titled `name`. */
function rowsOf(name: string): [HTMLElement, HTMLElement] {
  const item = screen.getByText(name).closest('li');
  const rows = item?.querySelectorAll<HTMLElement>('.messages-list__row') ?? [];
  if (rows.length !== 2) throw new Error(`expected two rows for ${name}`);
  return [rows[0], rows[1]];
}

describe('ConversationList rows', () => {
  it.each([
    ['team_instructor', 'Instructor'],
    ['team_ta', 'TA'],
  ] as const)('a %s row moves its label beside the unread count and drops the preview', (type, label) => {
    render(
      <ConversationList
        loading={false}
        conversations={[
          conversation({
            type,
            team_name: 'Trailhead',
            unread_count: 3,
            last_message: message('u2', 'Standup moved to 3pm'),
          }),
        ]}
      />,
    );
    const [nameRow, secondRow] = rowsOf('Trailhead');
    expect(within(nameRow).queryByText(label)).toBeNull();
    expect(within(secondRow).getByText(label)).toBeInTheDocument();
    expect(within(secondRow).getByLabelText('3 unread')).toHaveTextContent('3');
    expect(screen.queryByText(/Standup moved/)).toBeNull();
  });

  it('a direct message row keeps its preview, as plain text', () => {
    render(
      <ConversationList
        loading={false}
        conversations={[
          conversation({
            other_user: { id: 'u2', email: 'sam@ucsc.edu', name: 'Sam Lee' },
            last_message: message('me', '**On it** — `fix.py`'),
          }),
        ]}
      />,
    );
    const [, secondRow] = rowsOf('Sam Lee');
    expect(secondRow).toHaveTextContent('You: On it — fix.py');
    expect(secondRow.querySelector('strong, code')).toBeNull();
  });

  it('the team chat keeps its label beside the name and its preview', () => {
    render(
      <ConversationList
        loading={false}
        conversations={[
          conversation({
            type: 'team_members',
            team_name: 'Trailhead',
            last_message: message('u2', 'pushed the fix'),
          }),
        ]}
      />,
    );
    const [nameRow, secondRow] = rowsOf('Trailhead');
    expect(within(nameRow).getByText('Team')).toBeInTheDocument();
    expect(secondRow).toHaveTextContent('pushed the fix');
  });
});

describe('ConversationList avatars', () => {
  it('draws each row’s avatar hidden beside the printed name: the peer’s photo, the channel’s initials', () => {
    const { container } = render(
      <ConversationList
        loading={false}
        conversations={[
          conversation({ id: 'c1', other_user: { id: 'u2', email: 'sam@ucsc.edu', name: 'Sam Lee', image_url: 'https://img.example/sam.png' } }),
          conversation({ id: 'c2', type: 'team_members', team_name: 'Trailhead' }),
        ]}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    const [photo, initials] = Array.from(container.querySelectorAll('.gt-avatar'));
    expect(photo.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('src', 'https://img.example/sam.png');
    expect(photo).toHaveAttribute('alt', '');
    expect(photo).toHaveAttribute('aria-hidden', 'true');
    expect(photo).toHaveClass('gt-avatar--lg');
    expect(initials).toHaveTextContent('TR');
    expect(initials).toHaveAttribute('aria-hidden', 'true');
  });

  it('sizes the avatars and their loading circles by avatarSize', () => {
    const { container, rerender } = render(<ConversationList loading conversations={[]} avatarSize="md" />);
    const circles = container.querySelectorAll<HTMLElement>('.gt-skeleton');
    expect(circles[0].style.width).toBe('36px');
    expect(circles[0].style.height).toBe('36px');
    rerender(<ConversationList loading={false} conversations={[conversation({ other_user: { id: 'u2', email: 'sam@ucsc.edu', name: 'Sam Lee' } })]} avatarSize="md" />);
    expect(container.querySelector('.gt-avatar')).toHaveClass('gt-avatar--md');
  });
});
