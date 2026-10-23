import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Tag } from '../Tag';

describe('Tag', () => {
  it('Tag’s remove is labelled Remove React', async () => {
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>React</Tag>);
    const remove = screen.getByRole('button', { name: 'Remove React' });
    expect(remove).toHaveAttribute('type', 'button');
    expect(remove).toHaveClass('gt-tag__remove');
    expect(remove.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith();
  });

  it('removeLabel names the ×, and a tag that is not text falls back to "Remove tag"', () => {
    const { rerender } = render(<Tag onRemove={() => {}} removeLabel="Remove the React skill">React</Tag>);
    expect(screen.getByRole('button', { name: 'Remove the React skill' })).toBeInTheDocument();
    rerender(<Tag onRemove={() => {}}><b>React</b></Tag>);
    expect(screen.getByRole('button', { name: 'Remove tag' })).toBeInTheDocument();
    rerender(<Tag onRemove={() => {}}>{2026}</Tag>);
    expect(screen.getByRole('button', { name: 'Remove 2026' })).toBeInTheDocument();
  });

  it('puts the × in the tab order', async () => {
    render(<Tag onRemove={() => {}}>React</Tag>);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Remove React' })).toHaveFocus();
  });

  it('has no × without onRemove, and takes its tone, neutral by default', () => {
    const { container, rerender } = render(<Tag>TypeScript</Tag>);
    const tag = container.firstChild as HTMLElement;
    expect(tag).toHaveClass('gt-tag', 'gt-tag--neutral');
    expect(tag).not.toHaveClass('gt-tag--removable');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toHaveClass('gt-tag__text');
    rerender(<Tag tone="green" onRemove={() => {}}>TypeScript</Tag>);
    expect(tag).toHaveClass('gt-tag--green', 'gt-tag--removable');
    rerender(<Tag tone="blue">TypeScript</Tag>);
    expect(tag).toHaveClass('gt-tag--blue');
  });

  it('passes className, native props and ref to its span', () => {
    const ref = createRef<HTMLSpanElement>();
    const { container } = render(<Tag className="x" title="A long skill name" data-key="t" ref={ref}>A long skill name</Tag>);
    expect(ref.current).toBe(container.firstChild);
    expect(ref.current).toHaveClass('gt-tag', 'x');
    expect(ref.current).toHaveAttribute('title', 'A long skill name');
    expect(ref.current).toHaveAttribute('data-key', 't');
  });

  it('keeps the design’s 18px ×, with a 44px hit area on phones, and resets inherited text styles', () => {
    render(<Tag onRemove={() => {}}>React</Tag>);
    const [remove] = cssRules('.gt-tag__remove');
    expect(remove.getPropertyValue('width')).toBe('18px');
    expect(remove.getPropertyValue('height')).toBe('18px');
    // The × sets the padding, border, radius and background index.css's global button rule would give it.
    expect(remove.getPropertyValue('padding')).toBe('0px');
    expect(remove.getPropertyValue('border-style')).toBe('none');
    expect(remove.getPropertyValue('border-radius')).toBe('4px');
    expect(remove.getPropertyValue('background')).toBe('transparent');
    expect(remove.getPropertyValue('font')).toBe('inherit');
    expect(remove.getPropertyValue('transition')).toBe('opacity var(--gt-transition-fast), background-color var(--gt-transition-fast)');
    expect(cssRules('.gt-tag__remove', 'prefers-reduced-motion')[0].getPropertyValue('transition')).toBe('none');
    expect(cssRules('.gt-tag__remove:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring-tight)');
    const [hit] = cssRules('.gt-tag__remove::after', 'max-width: 767px');
    expect(hit.getPropertyValue('inset')).toBe('-13px');
    const [tag] = cssRules('.gt-tag');
    expect(tag.getPropertyValue('box-sizing')).toBe('border-box');
    expect(tag.getPropertyValue('text-transform')).toBe('none');
    expect(tag.getPropertyValue('letter-spacing')).toBe('normal');
  });
});
