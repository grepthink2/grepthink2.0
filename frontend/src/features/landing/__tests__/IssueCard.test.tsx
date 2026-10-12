import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IssueCard from '../components/IssueCard';

const fetchMock = vi.fn();
const ISSUE_URL = 'https://github.com/grepthink2/grepthink2.0/issues/42';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillAndSubmit({ title = 'Board crashes' } = {}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('GitHub username'), '@octocat');
  await user.type(screen.getByLabelText('School email'), 'ann@ucsc.edu');
  await user.type(screen.getByLabelText('Title'), title);
  await user.type(screen.getByLabelText('Description'), 'It **breaks**');
  await user.click(screen.getByRole('button', { name: 'Submit issue' }));
  return user;
}

describe('IssueCard', () => {
  it('shows its fields and says the email stays private', () => {
    render(<IssueCard />);
    expect(screen.getByRole('heading', { level: 2, name: 'Submit an issue' })).toBeInTheDocument();
    for (const label of ['GitHub username', 'School email', 'Title', 'Description']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Markdown is supported. The issue is public; your email stays private.')).toBeInTheDocument();
  });

  it('previews the description as markdown', async () => {
    const user = userEvent.setup();
    render(<IssueCard />);
    await user.type(screen.getByLabelText('Description'), 'It **breaks**');
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect((await screen.findByText('breaks')).tagName).toBe('STRONG');
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Write' }));
    expect(screen.getByLabelText('Description')).toHaveValue('It **breaks**');
  });

  it('posts the report with the @ stripped from the username', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { issue_number: 42, issue_url: ISSUE_URL }));
    render(<IssueCard />);
    await fillAndSubmit();

    await screen.findByRole('status');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/issues');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      github_user: 'octocat',
      email: 'ann@ucsc.edu',
      title: 'Board crashes',
      description: 'It **breaks**',
      website: '',
    });
  });

  it('links the filed issue and clears the form', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { issue_number: 42, issue_url: ISSUE_URL }));
    render(<IssueCard />);
    await fillAndSubmit();

    expect(await screen.findByRole('status')).toHaveTextContent('Filed as grepthink2.0#42');
    expect(screen.getByRole('link', { name: '#42' })).toHaveAttribute('href', ISSUE_URL);
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('says the report arrived by email when GitHub did not take it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { issue_number: null, issue_url: null }));
    render(<IssueCard />);
    await fillAndSubmit();

    expect(await screen.findByRole('status')).toHaveTextContent(
      "Thanks, your report reached us by email. We'll file it on GitHub ourselves.",
    );
  });

  it("shows a rejection's detail and keeps what was typed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { detail: "That GitHub username doesn't exist." }));
    render(<IssueCard />);
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent("That GitHub username doesn't exist.");
    expect(screen.getByLabelText('Title')).toHaveValue('Board crashes');
  });

  it.each([
    ['a server error', () => Promise.resolve(jsonResponse(502, { detail: 'Failed to send your report' }))],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('shows the generic error after %s', async (_label, reply) => {
    fetchMock.mockImplementation(reply);
    render(<IssueCard />);
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong sending your report. Please try again.',
    );
  });

  it('refuses a blank title without calling the server', async () => {
    render(<IssueCard />);
    await fillAndSubmit({ title: '   ' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Add a title and a description.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
