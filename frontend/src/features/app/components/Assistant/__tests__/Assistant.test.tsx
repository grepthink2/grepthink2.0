import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssistantIcon, AssistantMark } from '../AssistantIcon';
import { AssistantSuggestionCard } from '../AssistantSuggestionCard';
import { StalledFlag } from '../StalledFlag';
import { ReportCheckCard } from '../ReportCheckCard';
import { UnlinkedPRChip } from '../UnlinkedPRChip';

const evidence = (
  <>
    PR <b>#41</b> was merged into main.
  </>
);

describe('AssistantIcon', () => {
  it('is decorative unless it has a title', () => {
    const { container, rerender } = render(<AssistantIcon />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    rerender(<AssistantIcon title="Project assistant" />);
    expect(screen.getByRole('img', { name: 'Project assistant' })).toBeInTheDocument();
  });

  it('sizes the mark tile and the icon inside it together', () => {
    const { container } = render(<AssistantMark size="lg" />);
    const tile = container.firstElementChild;
    expect(tile).toHaveClass('gt-asst-mark', 'gt-asst-mark--lg');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile?.querySelector('svg')).toHaveAttribute('width', '18');
  });
});

describe('AssistantSuggestionCard', () => {
  it('names the evidence and the change, and does nothing until someone decides', async () => {
    const onApprove = vi.fn();
    const onDismiss = vi.fn();
    render(
      <AssistantSuggestionCard
        evidence={evidence}
        taskKey="GT-12"
        taskTitle="Connect the class roster API"
        onApprove={onApprove}
        onDismiss={onDismiss}
      />,
    );
    const card = screen.getByRole('group', { name: 'Project assistant suggestion' });
    expect(card).toHaveClass('gt-asst--app', 'gt-asst-suggest--pending');
    expect(card).toHaveTextContent('PR #41 was merged into main. Move this task to Done?');
    expect(within(card).getByText('GT-12')).toBeInTheDocument();
    expect(within(card).getByText('→ Done')).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();

    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Dismiss' }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('collapses to a confirmation line once approved', () => {
    render(<AssistantSuggestionCard state="approved" taskKey="GT-12" approvedBy="Jordan" />);
    expect(screen.getByRole('status')).toHaveTextContent('GT-12 moved to Done · approved by Jordan');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Undo after a dismissal only when it can undo', async () => {
    const onUndo = vi.fn();
    const { rerender } = render(<AssistantSuggestionCard state="dismissed" />);
    expect(screen.getByRole('status')).toHaveTextContent('Suggestion dismissed');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();

    rerender(<AssistantSuggestionCard state="dismissed" onUndo={onUndo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});

describe('StalledFlag', () => {
  it('states the facts and offers a nudge when it knows who to nudge', async () => {
    const onNudge = vi.fn();
    render(<StalledFlag taskKey="GT-9" title="Attendance tab" assignee="Sam" onNudge={onNudge} />);
    const flag = screen.getByRole('group', { name: 'Stalled: GT-9' });
    expect(within(flag).getByRole('heading')).toHaveTextContent('GT-9Attendance tab');
    expect(flag).toHaveTextContent('In Progress for 6 days · no commits');

    await userEvent.click(within(flag).getByRole('button', { name: 'Nudge Sam →' }));
    expect(onNudge).toHaveBeenCalledOnce();
  });

  it('says "1 day", and hides the nudge without an assignee', () => {
    render(<StalledFlag taskKey="GT-3" title="Login page" days={1} status="Review" />);
    expect(screen.getByText('Review for 1 day · no commits')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ReportCheckCard', () => {
  it('marks matching rows and offers Review only on the rest', async () => {
    const onReview = vi.fn();
    render(
      <ReportCheckCard
        project="ShoeShopper"
        rows={[
          { text: '4 reports match closed work' },
          { kind: 'review', text: 'Alex: reports 35%, closed 1 of 6 tasks', onReview },
        ]}
      />,
    );
    const card = screen.getByRole('group', { name: 'Week 5 status reports' });
    expect(card).toHaveTextContent('ShoeShopper');
    const [match, review] = within(card).getAllByRole('listitem');
    expect(match).toHaveClass('gt-asst-report__row--match');
    expect(within(match).queryByRole('button')).not.toBeInTheDocument();
    expect(review).toHaveClass('gt-asst-report__row--review');

    await userEvent.click(within(review).getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledOnce();
  });
});

describe('UnlinkedPRChip', () => {
  it('names the PR and offers to add a task, with chrome set by the surface', async () => {
    const onAdd = vi.fn();
    const { container } = render(<UnlinkedPRChip surface="bare" onAdd={onAdd} />);
    expect(container.firstElementChild).toHaveClass('gt-asst-unlinked--bare');
    expect(container.firstElementChild).toHaveTextContent("PR #44 isn't on the board ·Add task");

    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
