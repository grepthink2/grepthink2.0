import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { SearchField } from '../SearchField';

function Controlled({ initial = '', onClear }: { initial?: string; onClear?: () => void }) {
  const [q, setQ] = useState(initial);
  return <SearchField label="Search classmates" value={q} onChange={setQ} onClear={onClear} />;
}

describe('SearchField', () => {
  it('is a search box in a search landmark, named by a visually hidden label, never the placeholder', () => {
    render(<SearchField label="Search classmates" placeholder="Search by name or email…" value="" onChange={() => {}} />);
    const box = screen.getByRole('searchbox', { name: 'Search classmates' });
    expect(box).toHaveAttribute('type', 'search');
    expect(box).toHaveAttribute('placeholder', 'Search by name or email…');
    expect(box).toHaveClass('gt-search-field__input');
    expect(screen.getByText('Search classmates')).toHaveClass('gt-visually-hidden');
    expect(screen.getByRole('search')).toHaveClass('gt-search-field');
    expect(screen.getByRole('search').querySelector('.gt-search-field__icon svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is labelled Search, with the placeholder Search…, by default', () => {
    render(<SearchField value="" onChange={() => {}} />);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveAttribute('placeholder', 'Search…');
  });

  it('reports the typed string, not the event', async () => {
    const onChange = vi.fn();
    render(<SearchField label="Search projects" value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('clears through onClear and returns focus to the input', async () => {
    const onClear = vi.fn();
    render(<SearchField label="Search classmates" value="ana" onChange={() => {}} onClear={onClear} />);
    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(clear.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('searchbox', { name: 'Search classmates' })).toHaveFocus();
  });

  it('clears through onChange("") without onClear', async () => {
    render(<Controlled initial="ana" />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    const box = screen.getByRole('searchbox', { name: 'Search classmates' });
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('has no clear button while empty or disabled', () => {
    const { rerender } = render(<SearchField label="Search" value="" onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    rerender(<SearchField label="Search" value="ana" disabled onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeDisabled();
  });

  it('works uncontrolled: typing brings the clear button, which empties the box', async () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<SearchField label="Search" defaultValue="an" onChange={onChange} onClear={onClear} />);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    expect(box).toHaveValue('an');
    await userEvent.type(box, 'a');
    expect(box).toHaveValue('ana');
    expect(onChange).toHaveBeenLastCalledWith('ana');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(box).toHaveValue('');
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('applies compact, fullWidth and className, and passes native props and ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <SearchField id="roster-q" label="Search roster" compact fullWidth className="x" aria-controls="roster" ref={ref} value="" onChange={() => {}} />,
    );
    const box = screen.getByRole('searchbox', { name: 'Search roster' });
    expect(ref.current).toBe(box);
    expect(box).toHaveAttribute('id', 'roster-q');
    expect(box).toHaveAttribute('aria-controls', 'roster');
    expect(screen.getByRole('search')).toHaveClass('gt-search-field', 'gt-search-field--compact', 'gt-search-field--full', 'x');
  });

  it('is at least 44px tall on phones, with a 36px clear button', () => {
    render(<SearchField value="" onChange={() => {}} />);
    const [input] = cssRules('.gt-search-field__input', 'max-width: 767px');
    expect(input.getPropertyValue('min-height')).toBe('44px');
    const [clear] = cssRules('.gt-search-field__clear', 'max-width: 767px');
    expect(clear.getPropertyValue('width')).toBe('36px');
    expect(clear.getPropertyValue('height')).toBe('36px');
  });
});
