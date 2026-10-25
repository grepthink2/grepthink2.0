import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { collectReleases, RELEASES } from '../releaseNotes';
import ReleaseFeed from '../components/ReleaseFeed';

// The brief's three sample releases, through the real parser.
const SAMPLE = collectReleases({
  './notes/0.92.0.md': [
    '---', 'date: 2026-11-05', '---', '',
    '## New', '',
    "- **Final review sign-up.** Product Owners book their team's final review slot.",
    '- Instructors post one-hour slots for the class.', '',
    '## Improved', '',
    "- The scrum board's sprint picker shows each sprint's dates.",
    '- The [help center](/app/help-center) walks you through booking a slot.', '',
    '## Fixed', '',
    "- A `?` no longer shows in place of a member's avatar.", '',
  ].join('\n'),
  './notes/0.91.1.md': [
    '---', 'date: 2026-10-28', '---', '',
    '## Fixed', '',
    '- Picking a school in the profile menu keeps you on the page you were on.', '',
  ].join('\n'),
  './notes/0.91.0.md': [
    '---', 'date: 2026-10-23', '---', '',
    '## New', '',
    "- **What's new.** Release notes for every version.", '',
    '## Improved', '',
    '- Pages open faster.', '',
  ].join('\n'),
});

const entries = () => screen.getAllByRole('article');
const markedNew = () =>
  entries()
    .filter((entry) => within(entry).queryByText('New', { selector: '.gt-badge' }))
    .map((entry) => within(entry).getByText(/^\d+\.\d+\.\d+$/).textContent);

describe('ReleaseFeed', () => {
  it('lists the releases newest first, each headed by its date, with its version', () => {
    render(<ReleaseFeed releases={SAMPLE} lastSeen="0.92.0" />);
    const [first, second, third] = entries();
    expect(entries()).toHaveLength(3);
    expect(within(first).getByRole('heading', { level: 3 })).toHaveTextContent('November 5, 2026');
    expect(within(first).getByText('0.92.0')).toHaveClass('gt-release__version');
    expect(within(second).getByRole('heading', { level: 3 })).toHaveTextContent('October 28, 2026');
    expect(within(second).getByText('0.91.1')).toBeInTheDocument();
    expect(within(third).getByRole('heading', { level: 3 })).toHaveTextContent('October 23, 2026');
    expect(within(first).getByRole('heading', { level: 3 }).querySelector('time')).toHaveAttribute('datetime', '2026-11-05');
  });

  it('labels the groups New, Improved, Fixed, each above its list', () => {
    render(<ReleaseFeed releases={SAMPLE} lastSeen="0.92.0" />);
    const [first, second] = entries();
    const labels = within(first).getAllByRole('heading', { level: 4 });
    expect(labels.map((label) => label.textContent)).toEqual(['New', 'Improved', 'Fixed']);
    for (const label of labels) expect(label.nextElementSibling?.querySelector('ul')).not.toBeNull();
    expect(within(second).getAllByRole('heading', { level: 4 }).map((label) => label.textContent)).toEqual(['Fixed']);
  });

  it('marks the releases newer than the one last seen', () => {
    const { unmount } = render(<ReleaseFeed releases={SAMPLE} lastSeen="0.91.0" />);
    expect(markedNew()).toEqual(['0.92.0', '0.91.1']);
    unmount();
    render(<ReleaseFeed releases={SAMPLE} lastSeen="0.92.0" />);
    expect(markedNew()).toEqual([]);
  });

  it('marks only the newest release on a first visit', () => {
    render(<ReleaseFeed releases={SAMPLE} lastSeen={null} />);
    expect(markedNew()).toEqual(['0.92.0']);
    const marker = within(entries()[0]).getByText('New', { selector: '.gt-badge' });
    expect(marker).toHaveClass('gt-badge--info', 'gt-badge--sm', 'gt-release__marker');
  });

  it('renders inline code, and opens links in a new tab', () => {
    render(<ReleaseFeed releases={SAMPLE} lastSeen="0.92.0" />);
    expect(screen.getByText('?').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'help center' })).toHaveAttribute('target', '_blank');
  });

  it('follows the dark modal with tone="dark"', () => {
    const { container, rerender } = render(<ReleaseFeed releases={SAMPLE} lastSeen={null} />);
    expect(container.firstElementChild).toHaveClass('gt-release-feed');
    expect(container.firstElementChild).not.toHaveClass('gt-release-feed--dark');
    rerender(<ReleaseFeed releases={SAMPLE} lastSeen={null} tone="dark" />);
    expect(container.firstElementChild).toHaveClass('gt-release-feed', 'gt-release-feed--dark');
  });

  it('shows the empty state when there is no release', () => {
    render(<ReleaseFeed releases={[]} lastSeen={null} />);
    expect(screen.getByRole('heading', { level: 3, name: 'No release notes yet' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it("reads the notes folder by default", () => {
    render(<ReleaseFeed lastSeen={null} />);
    expect(entries()).toHaveLength(RELEASES.length);
    expect(within(entries()[0]).getByText(RELEASES[0].version)).toBeInTheDocument();
  });
});
