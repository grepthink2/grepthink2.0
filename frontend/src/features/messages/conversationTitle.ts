import type { ApiConversationSummary, ConversationType } from '@/lib/api';

/** Display title: DM → peer name/email; channel → team name. */
export function conversationTitle(conv: ApiConversationSummary): string {
  if (conv.type === 'dm') {
    return conv.other_user?.name || conv.other_user?.email || 'Unknown';
  }
  return conv.team_name || 'Your team';
}

/**
 * The name a conversation's avatar takes its initials and colour from: a DM's peer name or email, a
 * channel's title. A DM with no peer gets none, so its avatar shows "?" rather than the initials of
 * the "Unknown" title.
 */
export function conversationAvatarName(conv: ApiConversationSummary): string | undefined {
  if (conv.type === 'dm') return conv.other_user?.name || conv.other_user?.email || undefined;
  return conversationTitle(conv);
}

/** Short type chip; null for DMs (no chip). */
export function conversationBadge(type: ConversationType): string | null {
  switch (type) {
    case 'team_ta': return 'TA';
    case 'team_instructor': return 'Instructor';
    case 'team_members': return 'Team';
    default: return null;
  }
}
