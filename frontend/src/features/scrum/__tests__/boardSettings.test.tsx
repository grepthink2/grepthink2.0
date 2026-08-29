import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BoardSettingsModal from '../components/BoardSettingsModal';

vi.mock('@/lib/api', () => ({
  api: { getScrumRepos: vi.fn(), addScrumRepo: vi.fn(), deleteScrumRepo: vi.fn() },
}));
const { api } = await import('@/lib/api');

const props = {
  projectId: 'p1', scale: 'fibonacci' as const, canWrite: true,
  onClose: vi.fn(), onChangeScale: vi.fn(), onNotice: vi.fn(),
};

beforeEach(() => {
  vi.mocked(api.getScrumRepos).mockReset().mockResolvedValue({ repos: [] });
  vi.mocked(api.addScrumRepo).mockReset();
  vi.mocked(api.deleteScrumRepo).mockReset().mockResolvedValue(undefined);
  props.onChangeScale.mockReset();
  props.onNotice.mockReset();
});

describe('BoardSettingsModal — estimate scale', () => {
  it('offers the three scales and reports a change', async () => {
    render(<BoardSettingsModal {...props} />);
    expect(screen.getByRole('radio', { name: /fibonacci/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: /linear/ }));
    expect(props.onChangeScale).toHaveBeenCalledWith('linear');
  });

  it('says that existing points are untouched', () => {
    render(<BoardSettingsModal {...props} />);
    expect(screen.getByText(/points already[\s\S]*stay as they are/i)).toBeInTheDocument();
  });
});

describe('BoardSettingsModal — repositories (D8)', () => {
  it('never renders a token value, only that one is set', async () => {
    vi.mocked(api.getScrumRepos).mockResolvedValue({
      repos: [{ id: 'r1', repo_url: 'https://github.com/team/app', provider: 'github', has_token: true }],
    });
    const { container } = render(<BoardSettingsModal {...props} />);

    expect(await screen.findByText('https://github.com/team/app')).toBeInTheDocument();
    expect(screen.getByText('Token set')).toBeInTheDocument();
    // The token input is empty and of type password — a stored secret can never surface.
    const tokenInput = screen.getByLabelText(/access token/i) as HTMLInputElement;
    expect(tokenInput.value).toBe('');
    expect(tokenInput.type).toBe('password');
    expect(container.textContent).not.toMatch(/secret|ghp_|glpat/i);
  });

  it('adds a repository with an optional token and clears the fields', async () => {
    vi.mocked(api.addScrumRepo).mockResolvedValue({
      message: 'ok',
      repo: { id: 'r2', repo_url: 'https://github.com/team/api', provider: 'github', has_token: true },
    });
    render(<BoardSettingsModal {...props} />);

    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/team/api');
    await userEvent.type(screen.getByLabelText(/access token/i), 'ghp_secret');
    await userEvent.click(screen.getByRole('button', { name: /add repository/i }));

    expect(api.addScrumRepo).toHaveBeenCalledWith('p1', {
      repo_url: 'https://github.com/team/api', access_token: 'ghp_secret',
    });
    await waitFor(() => expect((screen.getByLabelText(/access token/i) as HTMLInputElement).value).toBe(''));
    expect(props.onNotice).toHaveBeenCalledWith('success', 'Repository saved');
  });

  it('omits the token key entirely when none is given', async () => {
    vi.mocked(api.addScrumRepo).mockResolvedValue({
      message: 'ok',
      repo: { id: 'r3', repo_url: 'https://github.com/team/pub', provider: 'github', has_token: false },
    });
    render(<BoardSettingsModal {...props} />);

    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/team/pub');
    await userEvent.click(screen.getByRole('button', { name: /add repository/i }));

    expect(api.addScrumRepo).toHaveBeenCalledWith('p1', { repo_url: 'https://github.com/team/pub' });
  });

  it('reports a rejected URL instead of failing silently', async () => {
    vi.mocked(api.addScrumRepo).mockRejectedValue(new Error('Repo URL must be a github.com or git.ucsc.edu repository'));
    render(<BoardSettingsModal {...props} />);

    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://gitlab.com/x/y');
    await userEvent.click(screen.getByRole('button', { name: /add repository/i }));

    await waitFor(() => expect(props.onNotice).toHaveBeenCalledWith('error', expect.stringMatching(/github\.com or git\.ucsc\.edu/)));
  });

  it('hides add and remove controls from staff viewers', async () => {
    vi.mocked(api.getScrumRepos).mockResolvedValue({
      repos: [{ id: 'r1', repo_url: 'https://github.com/team/app', provider: 'github', has_token: false }],
    });
    render(<BoardSettingsModal {...props} canWrite={false} />);

    await screen.findByText('https://github.com/team/app');
    expect(screen.queryByLabelText(/repository url/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});
