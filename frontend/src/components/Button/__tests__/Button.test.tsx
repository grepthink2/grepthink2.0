import { createRef, type FormEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { cssRules } from '@/test/cssRules';
import { Button } from '../Button';
import { buttonClassName } from '../buttonClassName';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Button', () => {
  it('defaults to a primary md button of type button', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('gt-button', 'gt-button--primary', 'gt-button--md');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('applies variant, size, fullWidth, pressed and className', () => {
    const { rerender } = render(
      <Button variant="danger-ghost" size="sm" fullWidth pressed className="x">Remove</Button>,
    );
    const button = screen.getByRole('button', { name: 'Remove' });
    expect(button).toHaveClass('gt-button', 'gt-button--danger-ghost', 'gt-button--sm', 'gt-button--full', 'x');
    expect(button).toHaveAttribute('aria-pressed', 'true');

    rerender(<Button variant="outline" size="lg" pressed={false}>Remove</Button>);
    expect(button).toHaveClass('gt-button--outline', 'gt-button--lg');
    expect(button).not.toHaveClass('gt-button--full', 'x');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders icons beside the label, hidden from assistive tech', () => {
    render(<Button iconLeft={<Plus />} iconRight={<ArrowRight />}>Add</Button>);
    const button = screen.getByRole('button', { name: 'Add' });
    const icons = button.querySelectorAll('.gt-button__icon');
    expect(icons).toHaveLength(2);
    icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
  });

  it('uses the native disabled attribute when disabled and not loading', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('runs onClick and passes native props through', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} data-focus-key="add" aria-describedby="hint" name="intent" value="save">Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('data-focus-key', 'add');
    expect(button).toHaveAttribute('aria-describedby', 'hint');
    expect(button).toHaveAttribute('name', 'intent');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('loading keeps focus, announces busy and blocks a second submit', async () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    const onClick = vi.fn();
    const { rerender } = render(<form onSubmit={onSubmit}><input aria-label="Title" /><Button type="submit" onClick={onClick}>Save</Button></form>);
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    rerender(<form onSubmit={onSubmit}><input aria-label="Title" /><Button type="submit" onClick={onClick} loading>Save</Button></form>);
    expect(save).toHaveFocus();
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toBeDisabled();
    await userEvent.click(save);
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('submits as usual once it is no longer busy', async () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(<form onSubmit={onSubmit}><input aria-label="Title" /><Button type="submit">Save</Button></form>);
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), '{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('stays focusable while loading, even when it is also disabled', () => {
    render(<Button disabled loading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('reserves the busy face up front and swaps it in while loading, so the width holds', () => {
    const { rerender } = render(<Button loadingLabel="Saving…" iconLeft={<Plus />}>Save changes</Button>);
    const button = screen.getByRole('button', { name: 'Save changes' });
    const idle = button.querySelector('.gt-button__face--idle');
    const busy = button.querySelector('.gt-button__face--busy');
    // Both faces sit in one grid cell; the one not showing is hidden from assistive tech too.
    expect(idle?.parentElement).toHaveClass('gt-button__faces');
    expect(busy?.parentElement).toBe(idle?.parentElement);
    expect(idle).not.toHaveAttribute('aria-hidden');
    expect(busy).toHaveAttribute('aria-hidden', 'true');
    expect(busy).toHaveTextContent('Saving…');

    rerender(<Button loadingLabel="Saving…" iconLeft={<Plus />} loading>Save changes</Button>);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBe(button);
    expect(button).toHaveClass('gt-button--loading');
    expect(idle).toHaveAttribute('aria-hidden', 'true');
    expect(busy).not.toHaveAttribute('aria-hidden');
    expect(busy?.querySelector('.gt-spinner')).toHaveClass('gt-spinner--16');
    expect(busy?.querySelector('.gt-spinner')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the idle label beside the spinner when no loadingLabel is given, and a 14px spinner when small', () => {
    const { container, rerender } = render(<Button>Save</Button>);
    expect(container.querySelector('.gt-button__face--busy')).toBeNull();

    rerender(<Button size="sm" loading>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.gt-button__face--busy')).toHaveTextContent('Save');
    expect(container.querySelector('.gt-spinner')).toHaveClass('gt-spinner--14');
  });

  it('renders a link with button classes from href; a disabled link has no href and aria-disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button href="https://ucsc.zoom.us/j/1" target="_blank" rel="noreferrer" size="sm" onClick={onClick}>Join Zoom</Button>,
    );
    const link = screen.getByRole('link', { name: 'Join Zoom' });
    expect(link).toHaveAttribute('href', 'https://ucsc.zoom.us/j/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveClass('gt-button', 'gt-button--primary', 'gt-button--sm');
    expect(link).not.toHaveAttribute('type');
    expect(link).not.toHaveAttribute('aria-disabled');
    link.addEventListener('click', (e) => e.preventDefault()); // jsdom does not navigate
    await userEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Button href="https://ucsc.zoom.us/j/1" disabled onClick={onClick}>Join Zoom</Button>);
    const disabled = screen.getByRole('link', { name: 'Join Zoom' });
    expect(disabled).not.toHaveAttribute('href');
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(disabled);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Button href="https://ucsc.zoom.us/j/1" loading loadingLabel="Opening…">Join Zoom</Button>);
    const busy = screen.getByRole('link', { name: 'Opening…' });
    expect(busy).not.toHaveAttribute('href');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders a router Link from to', async () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<Button to="/app/projects" variant="outline" onClick={onClick}>Browse projects</Button>} />
          <Route path="/app/projects" element={<p>Projects</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Browse projects' });
    expect(link).toHaveAttribute('href', '/app/projects');
    expect(link).toHaveClass('gt-button', 'gt-button--outline', 'gt-button--md');

    await userEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('renders a disabled router link without href, and without the router-only props', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <Button to="/app/projects" disabled replace state={{ from: 'home' }} preventScrollReset mask="/projects" onClick={onClick}>
          Browse projects
        </Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Browse projects' });
    expect(link).not.toHaveAttribute('href');
    // `mask` is an SVG attribute too, so React would put it on the <a> without a word.
    expect(link).not.toHaveAttribute('mask');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveClass('gt-button', 'gt-button--primary');
    await userEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
    expect(link).not.toHaveAttribute('tabindex');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps focus on a link while it is busy', () => {
    const { rerender } = render(<Button href="/help">Help</Button>);
    const link = screen.getByRole('link', { name: 'Help' });
    act(() => link.focus());

    // Without its href an <a> cannot take focus, so a busy one joins the tab order itself.
    rerender(<Button href="/help" loading loadingLabel="Opening…">Help</Button>);
    expect(screen.getByRole('link', { name: 'Opening…' })).toBe(link);
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAttribute('tabindex', '0');
    expect(link).toHaveFocus();

    rerender(<Button href="/help">Help</Button>);
    expect(link).toHaveAttribute('href', '/help');
    expect(link).not.toHaveAttribute('tabindex');
    expect(link).toHaveFocus();
  });

  it('keeps a router link, and its focus, while it is busy, and ignores clicks on it', async () => {
    const onClick = vi.fn();
    const at = (loading: boolean) => (
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route
            path="/app"
            element={<Button to="/app/projects" loading={loading} loadingLabel="Opening…" onClick={onClick}>Browse projects</Button>}
          />
          <Route path="/app/projects" element={<p>Projects</p>} />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(at(false));
    const link = screen.getByRole('link', { name: 'Browse projects' });
    act(() => link.focus());

    rerender(at(true));
    expect(screen.getByRole('link', { name: 'Opening…' })).toBe(link);
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByText('Projects')).toBeNull();
  });

  it('passes ref to the element it renders', () => {
    const button = createRef<HTMLButtonElement>();
    const anchor = createRef<HTMLAnchorElement>();
    const routed = createRef<HTMLAnchorElement>();
    render(
      <MemoryRouter>
        <Button ref={button}>Save</Button>
        <Button ref={anchor} href="/help">Help</Button>
        <Button ref={routed} to="/app">Home</Button>
      </MemoryRouter>,
    );
    expect(button.current).toBe(screen.getByRole('button', { name: 'Save' }));
    expect(anchor.current).toBe(screen.getByRole('link', { name: 'Help' }));
    expect(routed.current).toBe(screen.getByRole('link', { name: 'Home' }));
  });

  it('is at least 44px tall on phones', () => {
    render(<Button>Save</Button>);
    const [phone] = cssRules('.gt-button', 'max-width: 767px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
  });
});

describe('buttonClassName', () => {
  it('composes the same classes', () => {
    expect(buttonClassName({ variant: 'outline', size: 'sm', fullWidth: true, className: 'x' })).toBe(
      'gt-button gt-button--outline gt-button--sm gt-button--full x',
    );
    expect(buttonClassName()).toBe('gt-button gt-button--primary gt-button--md');
    expect(buttonClassName({ loading: true })).toBe('gt-button gt-button--primary gt-button--md gt-button--loading');
  });
});
