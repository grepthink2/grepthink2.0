import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Mail, MessageCircleMore, User, Users } from 'lucide-react';
import { Popover } from '@/components/Popover/Popover';
import { GithubIcon, LinkedinIcon } from '@/components/icons/BrandIcons';
import { MessageButton } from '@features/messages/components/MessageButton';
import type { ApiProjectTA } from '@/lib/api';
import type { ProjectMember } from './projectMembers';
import './ProjectMembersPopover.scss';

/** Hover intent: the pointer rests this long on the trigger before the panel opens… */
const OPEN_DELAY_MS = 150;
/** …and may stray this long (across the gap to the panel, say) before it closes. */
const CLOSE_DELAY_MS = 300;
/** How long the copy button reads "Copied". */
const COPIED_MS = 2000;

interface ProjectMembersPopoverProps {
  members: ProjectMember[];
  tas: ApiProjectTA[];
  /** The project's max team size; null when it has none. */
  teamSize: number | null;
  /** What "Copy all emails" writes, roster (edu) email first — the parent computes it from the raw members. */
  copyEmails: string[];
  /** Hides the Message button on your own row. */
  currentUserId?: string;
}

/** One person: avatar, name and role, then whichever ways to reach them exist. */
function MemberRow({ member, currentUserId }: { member: ProjectMember; currentUserId?: string }) {
  const { id, displayName, roleLabel, email, githubUrl, linkedInUrl, imageUrl } = member;
  return (
    <li className="project-members__row">
      <span className="project-members__avatar">
        {imageUrl ? <img src={imageUrl} alt="" /> : <User size={18} aria-hidden="true" />}
      </span>
      <span className="project-members__info">
        <span className="project-members__name">{displayName}</span>
        <span className="project-members__role">{roleLabel}</span>
      </span>
      <span className="project-members__links">
        {email && (
          <a className="project-members__link" href={`mailto:${email}`} title={email} aria-label={`Email ${displayName}`}>
            <Mail size={16} aria-hidden="true" />
          </a>
        )}
        {githubUrl && (
          <a
            className="project-members__link"
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${displayName} on GitHub`}
          >
            <GithubIcon width={16} height={16} aria-hidden="true" />
          </a>
        )}
        {linkedInUrl && (
          <a
            className="project-members__link"
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${displayName} on LinkedIn`}
          >
            <LinkedinIcon width={16} height={16} aria-hidden="true" />
          </a>
        )}
        {id && id !== currentUserId && (
          <MessageButton toUserId={id} toUserName={displayName} className="project-members__link">
            <MessageCircleMore size={16} aria-hidden="true" />
          </MessageButton>
        )}
      </span>
    </li>
  );
}

/**
 * The project header's "x/y members" stat, as the trigger of a panel listing the team (contact
 * links, a Message button, "Copy all emails") and the project's teaching assistants. Opens when
 * the pointer rests on it and closes a moment after the pointer leaves; a click, Enter or Space
 * toggles it at once, and Esc or a click outside closes it.
 */
export default function ProjectMembersPopover({
  members,
  tas,
  teamSize,
  copyEmails,
  currentUserId,
}: ProjectMembersPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const copiedTimer = useRef<number | undefined>(undefined);

  // No timer outlives the component.
  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  // The trigger and the panel share one wrapper, so these cover the pointer on either.
  const handleMouseEnter = () => {
    window.clearTimeout(closeTimer.current);
    if (open) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };

  const handleMouseLeave = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  // A click decides at once, whatever the pointer had set in motion.
  const handleTriggerClick = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setOpen((isOpen) => !isOpen);
  };

  // Stable, so Popover does not re-attach its Esc and outside-click listeners on every render.
  const closePanel = useCallback(() => setOpen(false), []);

  const copyAllEmails = async () => {
    try {
      await navigator.clipboard.writeText(copyEmails.join(', '));
    } catch {
      return; // clipboard unavailable or refused: the button keeps offering the copy
    }
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  const count = members.length;
  const countText = teamSize === null ? `${count}` : `${count}/${teamSize}`;
  const noun = teamSize === null && count === 1 ? 'member' : 'members';
  const tasText = tas.length === 0 ? '' : ` · ${tas.length} ${tas.length === 1 ? 'TA' : 'TAs'}`;
  // TAs get the member row too: no project role, no profile links.
  const taRows = tas.map((ta): ProjectMember => ({
    id: ta.user_id,
    displayName: ta.name,
    roleLabel: 'Teaching assistant',
    email: ta.email ?? undefined,
  }));

  const trigger = (
    <button
      type="button"
      className="project-members__trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={handleTriggerClick}
    >
      <Users size={16} aria-hidden="true" />
      <span>{`${countText} ${noun}${tasText}`}</span>
    </button>
  );

  return (
    <span className="project-members" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <Popover
        open={open}
        onClose={closePanel}
        anchor={trigger}
        placement="bottom"
        align="start"
        padded={false}
        className="project-members__panel"
        role="dialog"
        aria-label="Team members"
      >
        <div className="project-members__header">
          <h3 className="project-members__title">Team members</h3>
          <span className="project-members__count">{countText}</span>
          {copyEmails.length > 0 && (
            <button
              type="button"
              className={`project-members__copy${copied ? ' project-members__copy--copied' : ''}`}
              aria-label="Copy all team member emails"
              onClick={() => void copyAllEmails()}
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span>{copied ? 'Copied' : 'Copy all emails'}</span>
            </button>
          )}
        </div>
        {count > 0 ? (
          <ul className="project-members__list">
            {members.map((member, index) => (
              <MemberRow key={member.id ?? `member-${index}`} member={member} currentUserId={currentUserId} />
            ))}
          </ul>
        ) : (
          <p className="project-members__empty">No members yet</p>
        )}
        {taRows.length > 0 && (
          <>
            <h3 className="project-members__title">Teaching assistants</h3>
            <ul className="project-members__list">
              {taRows.map((ta) => (
                <MemberRow key={ta.id} member={ta} currentUserId={currentUserId} />
              ))}
            </ul>
          </>
        )}
      </Popover>
    </span>
  );
}
