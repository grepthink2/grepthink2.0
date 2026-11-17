import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ApiReleaseSummaryBody, ApiSprintReportBody, ApiTestReportBody } from '@/lib/api';
import ReleaseSummaryEditor from '../components/ReleaseSummaryEditor';
import SprintReportEditor from '../components/SprintReportEditor';
import TestReportEditor from '../components/TestReportEditor';
import type { BoardStory } from '../hooks/useBoardStories';
import { storyLookup } from '../utils/storyRefs';
import { makeDocument, releaseSummaryDerived, sprintReportDerived, testReportDerived } from './fixtures';

const boardStory = (over: Partial<BoardStory> = {}): BoardStory => ({
  id: 's1', key: 'US-1', title: 'Trail search', points: 5, acceptance_criteria: ['Finds a trail by name'],
  sprintId: 'sp1', sprintName: 'Sprint 1', completed: true, ...over,
});
const board = (stories: BoardStory[] = []) => ({
  status: 'ready' as const, stories, byId: new Map(stories.map((s) => [s.id, s])), retry: vi.fn(),
});

describe('SprintReportEditor', () => {
  function Editing({ initial, onBody }: { initial: ApiSprintReportBody; onBody?: (b: ApiSprintReportBody) => void }) {
    const [body, setBody] = useState(initial);
    return (
      <SprintReportEditor
        doc={makeDocument('sprint_report', { body: initial })}
        body={body}
        editable
        onChange={(b) => { setBody(b); onBody?.(b); }}
      />
    );
  }

  it('edits an action and its reason in each list, and the note for nothing to stop', async () => {
    const onBody = vi.fn();
    render(<Editing initial={{ stop: [], start: [], keep: [], satisfied_note: '' }} onBody={onBody} />);
    const start = screen.getByRole('region', { name: 'Start doing' });
    await userEvent.click(within(start).getByRole('button', { name: 'Add an action' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Action 1, Start doing' }), 'Pair on reviews');
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason 1, Start doing (optional)' }), 'fewer bugs');
    await userEvent.type(screen.getByRole('textbox', { name: 'Nothing to stop doing? Say why (optional)' }), 'All good');
    const last = onBody.mock.calls.at(-1)?.[0] as ApiSprintReportBody;
    expect(last.start).toEqual([expect.objectContaining({ action: 'Pair on reviews', reason: 'fewer bugs' })]);
    expect(last.satisfied_note).toBe('All good');
  });

  it("shows the board's sprint as it ended: stories, rates to date and the burnup", () => {
    const doc = makeDocument('sprint_report', {
      derived: sprintReportDerived({ not_completed: [{ id: 's9', missing: true }] }),
      derived_frozen: true,
    });
    render(<SprintReportEditor doc={doc} body={doc.body} editable={false} onChange={vi.fn()} />);
    expect(screen.getByText('From the board, as handed in')).toBeInTheDocument();
    expect(screen.getByText('As the sprint stood on Oct 18, 2026.')).toBeInTheDocument();
    expect(screen.getByText('Trail search')).toBeInTheDocument();
    expect(screen.getByText('A story that was deleted')).toBeInTheDocument();
    const rates = screen.getByRole('table', { name: /Work completion rate/ });
    expect(within(rates).getByRole('row', { name: /User stories per day 0\.07 0\.11/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Burnup: 6 of 12 hours complete' })).toBeInTheDocument();
    expect(screen.getAllByText('None.')).toHaveLength(3);
  });

  it('says when no end-of-sprint record was saved and the board stands in', () => {
    const doc = makeDocument('sprint_report', { derived: sprintReportDerived({ as_of: 'now' }) });
    render(<SprintReportEditor doc={doc} body={doc.body} editable={false} onChange={vi.fn()} />);
    expect(screen.getByText('Shown as the board is now: this sprint has no saved end-of-sprint record.')).toBeInTheDocument();
    expect(screen.getByText('From the board')).toBeInTheDocument();
  });
});

describe('ReleaseSummaryEditor', () => {
  const derived = releaseSummaryDerived({
    key_stories: [
      { id: 's1', key: 'US-1', title: 'Trail search', acceptance_criteria: ['Finds a trail by name'], completed: true },
      { id: 's2', missing: true },
    ],
  });
  const body: ApiReleaseSummaryBody = {
    key_story_ids: ['s1', 's2'], known_problems: [{ id: 'p1', kind: 'bug', text: 'Crash on Safari' }], follow_ups: [],
  };

  function Editing({ stories, onBody }: { stories: BoardStory[]; onBody: (b: ApiReleaseSummaryBody) => void }) {
    const [current, setCurrent] = useState(body);
    const doc = makeDocument('release_summary', { body, derived });
    const lookup = storyLookup(doc, new Map(stories.map((s) => [s.id, s])));
    return (
      <MemoryRouter>
        <ReleaseSummaryEditor
          doc={doc}
          body={current}
          editable
          onChange={(b) => { setCurrent(b); onBody(b); }}
          story={lookup}
          board={board(stories)}
        />
      </MemoryRouter>
    );
  }

  it('lists each key story with its criteria, a link to it on the board, and a deleted one as gone', () => {
    render(<Editing stories={[boardStory()]} onBody={vi.fn()} />);
    const keyStories = screen.getByRole('list', { name: 'Key stories' });
    expect(within(keyStories).getByText('Finds a trail by name')).toBeInTheDocument();
    expect(within(keyStories).getByRole('link', { name: 'Edit on the board' }))
      .toHaveAttribute('href', '/app/projects/p1/board?sprint=sp1&story=s1');
    expect(within(keyStories).getByText('A story that was deleted')).toBeInTheDocument();
  });

  it("adds a key story from the board's stories, searching by key or title", async () => {
    const onBody = vi.fn();
    render(<Editing stories={[boardStory(), boardStory({ id: 's3', key: 'US-3', title: 'Offline maps', sprintId: null, sprintName: null })]} onBody={onBody} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a key story' }));
    const panel = screen.getByRole('dialog', { name: 'Add a key story' });
    // US-1 is a key story already: only US-3 is offered.
    expect(within(panel).queryByText('Trail search')).not.toBeInTheDocument();
    await userEvent.type(within(panel).getByRole('searchbox', { name: 'Search the board’s stories' }), 'offline');
    await userEvent.click(within(panel).getByRole('button', { name: /US-3 Offline maps Backlog/ }));
    expect(onBody).toHaveBeenLastCalledWith(expect.objectContaining({ key_story_ids: ['s1', 's2', 's3'] }));
    expect(screen.queryByRole('dialog', { name: 'Add a key story' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a key story' }));
  });

  it("sets a known problem's kind and shows the backlog the board holds", async () => {
    const onBody = vi.fn();
    render(<Editing stories={[]} onBody={onBody} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Kind of known problem 1' }), 'shortcut');
    expect(onBody).toHaveBeenLastCalledWith(expect.objectContaining({
      known_problems: [{ id: 'p1', kind: 'shortcut', text: 'Crash on Safari' }],
    }));
    const backlog = screen.getByRole('table', { name: 'Product backlog' });
    expect(within(backlog).getByRole('row', { name: /US-2 Offline maps 8 Sprint 2/ })).toBeInTheDocument();
  });

  it('shows the kind as a tag and no controls to a reader', () => {
    const doc = makeDocument('release_summary', { body, derived, access: 'staff' });
    render(
      <MemoryRouter>
        <ReleaseSummaryEditor doc={doc} body={body} editable={false} onChange={vi.fn()} story={storyLookup(doc, new Map())} board={board()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit on the board' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a key story' })).not.toBeInTheDocument();
  });
});

describe('TestReportEditor', () => {
  const scenario = { id: 'sc1', title: 'Search', story_ids: ['s1'], steps_md: '1. Open the map\n2. **Search**', result: null, note: '' };
  const derived = testReportDerived({
    stories: { s1: { key: 'US-1', title: 'Trail search', acceptance_criteria: ['Finds a trail by name'] } },
    scenarios: [{ id: 'sc1', story_ids: ['s1'] }],
    uncovered: [{ id: 's4', key: 'US-4', title: 'Share a trail' }],
  });
  const body: ApiTestReportBody = { scenarios: [scenario], unit_tests: [], unit_tests_note: '' };

  function Editing({ onBody, stories = [] }: { onBody: (b: ApiTestReportBody) => void; stories?: BoardStory[] }) {
    const [current, setCurrent] = useState(body);
    const doc = makeDocument('test_report', { body, derived });
    return (
      <TestReportEditor
        doc={doc}
        body={current}
        editable
        onChange={(b) => { setCurrent(b); onBody(b); }}
        story={storyLookup(doc, new Map(stories.map((s) => [s.id, s])))}
        board={board(stories)}
      />
    );
  }

  it("marks a scenario's result, and previews its steps as Markdown", async () => {
    const onBody = vi.fn();
    render(<Editing onBody={onBody} />);
    expect(screen.getByText('Finds a trail by name')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Result of scenario 1' })).getByRole('radio', { name: 'Pass' }));
    expect(onBody).toHaveBeenLastCalledWith(expect.objectContaining({ scenarios: [expect.objectContaining({ result: 'pass' })] }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview the steps' }));
    expect(within(screen.getByRole('region', { name: 'Steps of scenario 1, as they will read' })).getByText('Search', { selector: 'strong' })).toBeInTheDocument();
  });

  it('adds a scenario for a story no scenario covers, its criteria as steps, and focuses its title', async () => {
    const onBody = vi.fn();
    render(<Editing onBody={onBody} stories={[boardStory({ id: 's4', key: 'US-4', title: 'Share a trail', acceptance_criteria: ['Copies a link'] })]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a scenario for it: US-4' }));
    const [last] = onBody.mock.calls.at(-1) as [ApiTestReportBody];
    const added = last.scenarios[1];
    expect(added).toMatchObject({ title: 'Share a trail', story_ids: ['s4'], steps_md: '1. Copies a link', result: null });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Title of scenario 2' }));
    // Covered now, by a scenario not saved yet: the hint lets it go.
    expect(screen.queryByRole('button', { name: 'Add a scenario for it: US-4' })).not.toBeInTheDocument();
  });

  it('lists unit tests with the repositories as suggestions, and marks failing ones', async () => {
    const onBody = vi.fn();
    render(<Editing onBody={onBody} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a location' }));
    const location = screen.getByRole('combobox', { name: /Location of unit tests 1/ });
    const list = document.getElementById(location.getAttribute('list') ?? '');
    expect(list?.querySelector('option')?.getAttribute('value')).toBe('https://github.com/team/trailhead');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Some of these tests fail' }));
    expect(onBody).toHaveBeenLastCalledWith(expect.objectContaining({ unit_tests: [expect.objectContaining({ failing: true })] }));
  });

  it('caps a scenario at five stories', () => {
    const full = { ...scenario, story_ids: ['a', 'b', 'c', 'd', 'e'] };
    const doc = makeDocument('test_report', { body: { ...body, scenarios: [full] }, derived });
    render(<TestReportEditor doc={doc} body={doc.body} editable onChange={vi.fn()} story={storyLookup(doc, new Map())} board={board()} />);
    expect(screen.getByRole('button', { name: 'Add a story' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add a story' })).toHaveAccessibleDescription('A scenario covers at most 5 stories.');
  });
});
