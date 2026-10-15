import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiProjectTA } from '@/lib/api';
import type { ProjectMember } from '../projectMembers';

vi.mock('@features/messages/components/MessageButton', () => ({
  MessageButton: ({ toUserName }: { toUserName?: string | null }) => (
    <button type="button">{`Message ${toUserName}`}</button>
  ),
}));

import ProjectMembersPopover from '../ProjectMembersPopover';

const ana: ProjectMember = {
  id: 'u-ana',
  displayName: 'Ana Lopez',
  roleLabel: 'Product Owner',
  email: 'ana@ucsc.edu',
  githubUrl: 'https://github.com/ana-l',
  linkedInUrl: 'https://www.linkedin.com/in/ana-lopez',
  imageUrl: 'https://example.com/ana.png',
};
const ben: ProjectMember = { id: 'u-ben', displayName: 'Ben Okafor', roleLabel: 'Scrum Master', email: 'ben@ucsc.edu' };
const cai: ProjectMember = { id: 'u-cai', displayName: 'Cai Nguyen', roleLabel: 'Member' };
const tara: ApiProjectTA = { user_id: 'u-ta', name: 'Tara Singh', email: 'tsingh@ucsc.edu' };

type Props = ComponentProps<typeof ProjectMembersPopover>;
const baseProps: Props = { members: [ana, ben], tas: [tara], teamSize: 5, copyEmails: [] };

function renderPopover(overrides: Partial<Props> = {}) {
  return render(<ProjectMembersPopover {...baseProps} {...overrides} />);
}

/** The "x/y members" trigger; its name follows the props. */
const trigger = () => screen.getByRole('button', { name: /^\d+(\/\d+)? members?\b/ });
const dialog = () => screen.queryByRole('dialog', { name: 'Team members' });

function openPanel() {
  fireEvent.click(trigger());
  return screen.getByRole('dialog', { name: 'Team members' });
}

describe('ProjectMembersPopover', () => {
  it('sums up the team on the trigger', () => {
    const { rerender } = renderPopover();
    expect(screen.getByRole('button', { name: '2/5 members · 1 TA' })).toBeInTheDocument();

    rerender(<ProjectMembersPopover {...baseProps} members={[ana, ben, cai]} tas={[]} teamSize={null} />);
    expect(screen.getByRole('button', { name: '3 members' })).toBeInTheDocument();

    rerender(<ProjectMembersPopover {...baseProps} members={[ana]} tas={[]} teamSize={null} />);
    expect(screen.getByRole('button', { name: '1 member' })).toBeInTheDocument();

    rerender(
      <ProjectMembersPopover
        {...baseProps}
        members={[ana]}
        tas={[tara, { user_id: 'u-ta2', name: 'Theo Park', email: null }]}
        teamSize={null}
      />,
    );
    expect(screen.getByRole('button', { name: '1 member · 2 TAs' })).toBeInTheDocument();
  });

  describe('on hover', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

    it('peeks while the pointer rests, closes after it leaves, and holds when it comes back', () => {
      const { unmount } = renderPopover();

      fireEvent.mouseEnter(trigger());
      wait(149);
      expect(dialog()).toBeNull();
      wait(1);
      const panel = screen.getByRole('dialog', { name: 'Team members' });
      expect(trigger()).toHaveAttribute('aria-expanded', 'true');

      // Crossing the gap to the panel: back inside within 300 ms, so it stays.
      fireEvent.mouseLeave(trigger());
      wait(299);
      expect(dialog()).toBeInTheDocument();
      fireEvent.mouseEnter(panel);
      wait(1000);
      expect(dialog()).toBeInTheDocument();

      fireEvent.mouseLeave(panel);
      wait(299);
      expect(dialog()).toBeInTheDocument();
      wait(1);
      expect(dialog()).toBeNull();

      // A pending open dies with the component.
      fireEvent.mouseEnter(trigger());
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('pins a peek on click, so leaving no longer closes it, and a second click does', () => {
      renderPopover();
      fireEvent.mouseEnter(trigger());
      wait(150);
      expect(dialog()).toBeInTheDocument();

      fireEvent.click(trigger());
      expect(dialog()).toBeInTheDocument();
      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
      fireEvent.mouseLeave(trigger());
      wait(300);
      expect(dialog()).toBeInTheDocument();

      fireEvent.click(trigger());
      expect(dialog()).toBeNull();
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('opens at once on a click, and closes on a second click or Escape', async () => {
    const user = userEvent.setup();
    renderPopover();
    const button = trigger();
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    expect(dialog()).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await user.click(button);
    expect(dialog()).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    expect(dialog()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('hands focus back to the trigger when the panel closes around it', async () => {
    const user = userEvent.setup();
    renderPopover({ copyEmails: ['a@ucsc.edu'] });

    await user.click(trigger());
    await user.tab();
    expect(screen.getByRole('button', { name: /copy all emails/i })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(trigger()).toHaveFocus();

    // A click on the trigger that leaves focus in the panel (Safari does not focus clicked buttons).
    await user.click(trigger());
    await user.tab();
    fireEvent.click(trigger());
    expect(dialog()).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('lists the members with their roles, and the TAs under their own heading', () => {
    renderPopover();
    const panel = openPanel();
    expect(within(panel).getByText('2/5')).toBeInTheDocument();

    const [memberList, taList] = within(panel).getAllByRole('list');
    const rows = within(memberList).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ana Lopez');
    expect(rows[0]).toHaveTextContent('Product Owner');
    expect(rows[1]).toHaveTextContent('Ben Okafor');
    expect(rows[1]).toHaveTextContent('Scrum Master');

    const taHeading = within(panel).getByRole('heading', { name: 'Teaching assistants' });
    expect(taHeading.nextElementSibling).toBe(taList);
    expect(within(taList).getByText('Tara Singh')).toBeInTheDocument();
    expect(within(taList).getByText('Teaching assistant')).toBeInTheDocument();
  });

  it('opens email in place and profiles in a new tab, only where there is a link', () => {
    renderPopover();
    const panel = openPanel();

    const email = within(panel).getByRole('link', { name: 'Email Ana Lopez' });
    expect(email).toHaveAttribute('href', 'mailto:ana@ucsc.edu');
    expect(email).not.toHaveAttribute('target');

    const github = within(panel).getByRole('link', { name: 'Ana Lopez on GitHub' });
    expect(github).toHaveAttribute('href', 'https://github.com/ana-l');
    expect(github).toHaveAttribute('target', '_blank');
    expect(github).toHaveAttribute('rel', 'noopener noreferrer');
    const linkedin = within(panel).getByRole('link', { name: 'Ana Lopez on LinkedIn' });
    expect(linkedin).toHaveAttribute('target', '_blank');
    expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer');

    expect(within(panel).queryByRole('link', { name: 'Ben Okafor on GitHub' })).toBeNull();
    expect(within(panel).queryByRole('link', { name: 'Ben Okafor on LinkedIn' })).toBeNull();
  });

  it('offers a Message button on every row but your own', () => {
    const noId: ProjectMember = { displayName: 'Dee Ruiz', roleLabel: 'Member' };
    const { rerender } = renderPopover({ members: [ana, ben, noId], currentUserId: 'u-ana' });
    const panel = openPanel();
    expect(within(panel).queryByRole('button', { name: 'Message Ana Lopez' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Message Ben Okafor' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Message Dee Ruiz' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Message Tara Singh' })).toBeInTheDocument();

    rerender(<ProjectMembersPopover {...baseProps} currentUserId="u-ta" />);
    expect(screen.queryByRole('button', { name: 'Message Tara Singh' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Message Ana Lopez' })).toBeInTheDocument();
  });

  it('copies every email, says so, and offers nothing to copy without emails', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const { rerender } = renderPopover({ copyEmails: ['a@ucsc.edu', 'b@ucsc.edu'] });
    await user.click(trigger());
    const copy = screen.getByRole('button', { name: /copy all emails/i });

    writeText.mockRejectedValueOnce(new Error('denied')); // a refused clipboard changes nothing
    await user.click(copy);
    expect(copy).toHaveAccessibleName('Copy all emails');

    writeText.mockResolvedValueOnce(undefined);
    await user.click(copy);
    expect(writeText).toHaveBeenLastCalledWith('a@ucsc.edu, b@ucsc.edu');
    await waitFor(() => expect(copy).toHaveAccessibleName('Copied'));
    expect(within(copy).getByText('Copied')).toHaveAttribute('aria-live', 'polite'); // announced
    expect(copy).toHaveClass('project-members__copy--copied');

    rerender(<ProjectMembersPopover {...baseProps} copyEmails={[]} />);
    expect(screen.queryByRole('button', { name: /copy all emails|copied/i })).toBeNull();
  });

  it('says when the team has no members yet', () => {
    renderPopover({ members: [], tas: [] });
    const panel = openPanel();
    expect(within(panel).getByText('No members yet')).toBeInTheDocument();
    expect(within(panel).queryByRole('list')).toBeNull();
  });
});
