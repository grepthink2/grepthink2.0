import { PersonLink } from '@/components/PersonLink/PersonLink';
import type { ApiConversationSummary } from '@/lib/api';

interface ThreadTitleProps {
  conversation: ApiConversationSummary;
  /** The thread's title, as its heading words it. */
  title: string;
}

/**
 * A thread's title on the Messages page. A direct message leads to the other person's page while
 * the two can still write to each other: once they share no class (`can_send` false) that page
 * would refuse the viewer, so the name stays text. A team channel names a team, not a person.
 */
export function ThreadTitle({ conversation, title }: ThreadTitleProps) {
  const person = conversation.type === 'dm' && conversation.can_send ? conversation.other_user : null;
  return person ? <PersonLink person={{ id: person.id, name: title }} /> : <>{title}</>;
}
