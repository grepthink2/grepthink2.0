import { describe, expect, it } from 'vitest';
import { conversationAvatarName, conversationTitle, conversationBadge } from '../conversationTitle';
import type { ApiConversationSummary } from '@/lib/api';

const base: Omit<ApiConversationSummary, 'type' | 'team_name' | 'other_user'> = {
  id: 'c', project_id: 'p', participants: [], last_message: null,
  unread_count: 0, other_user_last_read_at: null, can_send: true,
  last_message_at: null,
};

describe('conversationTitle', () => {
  it('uses the peer name for DMs', () => {
    const conv = { ...base, type: 'dm', team_name: null,
      other_user: { id: 'x', email: 'x@ucsc.edu', name: 'Xena X' } } as ApiConversationSummary;
    expect(conversationTitle(conv)).toBe('Xena X');
  });

  it('falls back to email then Unknown for DMs', () => {
    const noName = { ...base, type: 'dm', team_name: null,
      other_user: { id: 'x', email: 'x@ucsc.edu', name: null } } as ApiConversationSummary;
    expect(conversationTitle(noName)).toBe('x@ucsc.edu');
    const nothing = { ...base, type: 'dm', team_name: null,
      other_user: null } as ApiConversationSummary;
    expect(conversationTitle(nothing)).toBe('Unknown');
  });

  it('uses the team name for channels', () => {
    const conv = { ...base, type: 'team_ta', team_name: 'Team Rocket',
      other_user: null } as ApiConversationSummary;
    expect(conversationTitle(conv)).toBe('Team Rocket');
  });

  it('falls back for channels missing a team name', () => {
    const conv = { ...base, type: 'team_members', team_name: null,
      other_user: null } as ApiConversationSummary;
    expect(conversationTitle(conv)).toBe('Your team');
  });
});

describe('conversationAvatarName', () => {
  it('names a DM’s avatar after its peer, and gives a DM with no peer no name, not Unknown', () => {
    const named = { ...base, type: 'dm', team_name: null,
      other_user: { id: 'x', email: 'x@ucsc.edu', name: 'Xena X' } } as ApiConversationSummary;
    expect(conversationAvatarName(named)).toBe('Xena X');
    const noName = { ...base, type: 'dm', team_name: null,
      other_user: { id: 'x', email: 'x@ucsc.edu', name: null } } as ApiConversationSummary;
    expect(conversationAvatarName(noName)).toBe('x@ucsc.edu');
    const nothing = { ...base, type: 'dm', team_name: null, other_user: null } as ApiConversationSummary;
    expect(conversationAvatarName(nothing)).toBeUndefined();
  });

  it('names a channel’s avatar after its title', () => {
    const conv = { ...base, type: 'team_ta', team_name: 'Team Rocket', other_user: null } as ApiConversationSummary;
    expect(conversationAvatarName(conv)).toBe('Team Rocket');
    const unnamed = { ...base, type: 'team_members', team_name: null, other_user: null } as ApiConversationSummary;
    expect(conversationAvatarName(unnamed)).toBe('Your team');
  });
});

describe('conversationBadge', () => {
  it('maps channel types to short labels', () => {
    expect(conversationBadge('dm')).toBeNull();
    expect(conversationBadge('team_ta')).toBe('TA');
    expect(conversationBadge('team_instructor')).toBe('Instructor');
    expect(conversationBadge('team_members')).toBe('Team');
  });
});
