import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ApiConversationSummary } from '@/lib/api';
import { ThreadTitle } from '../components/ThreadTitle';

const SAM = { id: 'u2', email: 'sam@ucsc.edu', name: 'Sam Lee', image_url: null };
const conversation = (over: Partial<ApiConversationSummary> = {}): ApiConversationSummary => ({
  id: 'c1', type: 'dm', project_id: null, team_name: null, participants: [], other_user: SAM,
  last_message: null, unread_count: 0, other_user_last_read_at: null, can_send: true, last_message_at: null,
  ...over,
});
const show = (c: ApiConversationSummary, title: string) =>
  render(<ThreadTitle conversation={c} title={title} />, { wrapper: MemoryRouter });

describe('ThreadTitle', () => {
  it('links a direct message to the person, with no card', () => {
    show(conversation(), 'Sam Lee');
    const link = screen.getByRole('link', { name: 'Sam Lee' });
    expect(link).toHaveAttribute('href', '/app/people/u2');
    expect(link).toHaveClass('gt-person-link--plain');
    expect(link.closest('.gt-person-link-wrap')).toBeNull();
  });

  it('stays plain when the two no longer share a class', () => {
    show(conversation({ can_send: false }), 'Sam Lee');
    expect(screen.getByText('Sam Lee')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('stays plain for a team channel, and for a message with no one on the other side', () => {
    const { unmount } = show(conversation({ type: 'team_members', other_user: null, team_name: 'Trailhead' }), 'Trailhead');
    expect(screen.getByText('Trailhead')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    unmount();
    show(conversation({ other_user: null }), 'Unknown');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
