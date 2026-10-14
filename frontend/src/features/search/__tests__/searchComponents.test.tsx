import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MatchText } from '../components/MatchText';
import { ResultGroup, ResultRow } from '../components/ResultRow';
import { SearchPagination } from '../components/SearchPagination';
import { SearchTrigger } from '../components/SearchTrigger';
import { initialsOf, modKey, shortDate } from '../format';
import type { SearchItem } from '../searchModel';

const item = (over: Partial<SearchItem> = {}): SearchItem => ({
  id: 't1', type: 'task', title: 'Roster CSV importer', href: '/app/x', ...over,
});

const noop = () => {};

describe('format', () => {
  it('uses Ctrl outside Apple platforms (jsdom) and initials from the first and last word', () => {
    expect(modKey()).toBe('Ctrl');
    expect(initialsOf('Ashton Liu')).toBe('AL');
    expect(initialsOf('Richard van Jullig')).toBe('RJ');
    expect(initialsOf('ta1@ucsc.edu')).toBe('TA');
    expect(initialsOf('   ')).toBe('?');
  });

  it('formats a bare date and an ISO timestamp, and refuses garbage', () => {
    expect(shortDate('2026-10-12')).toBe('Oct 12');
    expect(shortDate('2026-10-07T17:00:00Z')).toMatch(/^Oct [78]$/); // local time zone
    expect(shortDate('nope')).toBeNull();
    expect(shortDate(null)).toBeNull();
  });
});

describe('MatchText', () => {
  it('marks every case-insensitive occurrence and keeps the text intact', () => {
    const { container } = render(<MatchText text="Roster radar roster" query="ROS" />);
    expect(container.querySelectorAll('mark')).toHaveLength(2);
    expect(container.textContent).toBe('Roster radar roster');
  });

  it('renders plain text for a blank query or no occurrence', () => {
    const { container } = render(<MatchText text="Roster" query="  " />);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Roster');
  });
});

describe('ResultRow', () => {
  it('shows a task’s key, status, subtitle and at most two tags, and selects on click', () => {
    const onSelect = vi.fn();
    render(
      <ul>
        <ResultRow
          id="opt-0"
          item={item({ key: 'GT-12', status: 'in_progress', subtitle: 'Grepthink 2.0', tags: ['backend', 'bug', 'extra'] })}
          query="ros"
          active
          onSelect={onSelect}
          onHover={noop}
        />
      </ul>,
    );
    const row = screen.getByRole('option');
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveTextContent('GT-12');
    expect(row).toHaveTextContent('In progress');
    expect(row).toHaveTextContent('Grepthink 2.0');
    expect(row).toHaveTextContent('Task');
    expect(row.querySelectorAll('.gt-palette__tag')).toHaveLength(2);
    expect(row.querySelectorAll('mark')).toHaveLength(1);
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('shows a chat’s unread badge and last message date, and a person’s initials', () => {
    render(
      <ul>
        <ResultRow id="a" item={item({ id: 'c1', type: 'conversation', title: 'Ashton Liu', subtitle: 'Direct message', unread: 3, last_message_at: '2026-10-07T17:00:00Z' })} query="" active={false} onSelect={noop} onHover={noop} />
        <ResultRow id="b" item={item({ id: 'u1', type: 'person', title: 'Ashton Liu', subtitle: 'Student · CSE 115B' })} query="" active={false} onSelect={noop} onHover={noop} />
      </ul>,
    );
    expect(screen.getByLabelText('3 unread')).toHaveTextContent('3');
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(/Oct [78]/);
    expect(screen.getAllByRole('option')[1].querySelector('.gt-entity--person')).toHaveTextContent('AL');
  });

  it('sets the active row on mouse movement', () => {
    const onHover = vi.fn();
    render(<ul><ResultRow id="a" item={item()} query="" active={false} onSelect={noop} onHover={onHover} /></ul>);
    fireEvent.mouseMove(screen.getByRole('option'));
    expect(onHover).toHaveBeenCalledTimes(1);
  });
});

describe('ResultGroup', () => {
  it('offers "See all n" only for a group with more than one item', () => {
    const onSeeAll = vi.fn();
    const { rerender } = render(<ul><ResultGroup label="Tasks" count={3} onSeeAll={onSeeAll} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: 'See all 3' }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
    rerender(<ul><ResultGroup label="Tasks" count={1} onSeeAll={onSeeAll} /></ul>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SearchPagination', () => {
  it('disables Previous on the first page, pages forward, and renders nothing for an empty list', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchPagination page={1} pages={3} from={1} to={8} total={20} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByText('1–8 of 20')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(<SearchPagination page={1} pages={1} from={0} to={0} total={0} onChange={onChange} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('SearchTrigger', () => {
  it('is labelled with the platform chord, opens on click and prefetches on hover', () => {
    const onOpen = vi.fn();
    const onPrefetch = vi.fn();
    render(<SearchTrigger onOpen={onOpen} onPrefetch={onPrefetch} />);
    const button = screen.getByRole('button', { name: 'Search (Ctrl K)' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.mouseEnter(button);
    expect(onPrefetch).toHaveBeenCalledTimes(1);
    expect(onPrefetch).toHaveBeenCalledWith(); // no event leaks into refresh(force)
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
