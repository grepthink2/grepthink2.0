import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Card } from '../Card';

const root = (container: HTMLElement) => container.firstChild as HTMLElement;

describe('Card', () => {
  it('renders the title and subtitle header', () => {
    const { container } = render(<Card title="Team" subtitle="5 members">Five people</Card>);
    const card = root(container);
    expect(card).toHaveClass('gt-card', 'gt-card--card');
    const title = screen.getByRole('heading', { level: 3, name: 'Team' });
    expect(title).toHaveClass('gt-card__title');
    expect(screen.getByText('5 members')).toHaveClass('gt-card__subtitle');
    expect(title.parentElement).toHaveClass('gt-card__heading');
    expect(title.closest('.gt-card__header')).not.toBeNull();
    expect(screen.getByText('Five people')).toHaveClass('gt-card__body');
    // The title is the visible heading, never the HTML tooltip attribute.
    expect(card).not.toHaveAttribute('title');
  });

  it('sets the title’s heading level, or a paragraph', () => {
    const { rerender } = render(<Card title="Team" titleAs="h2" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Team' })).toBeInTheDocument();
    rerender(<Card title="Team" titleAs="p" />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Team').tagName).toBe('P');
    expect(screen.getByText('Team')).toHaveClass('gt-card__title');
  });

  it('renders a custom header and the footer', () => {
    const { container, rerender } = render(
      <Card header={<div>Custom head</div>} title="Hidden" footer={<button type="button">Accept</button>}>Body</Card>,
    );
    const header = container.querySelector('.gt-card__header')!;
    expect(within(header as HTMLElement).getByText('Custom head')).toBeInTheDocument();
    // The header replaces the title block.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('.gt-card__heading')).toBeNull();
    const footer = container.querySelector('.gt-card__footer')!;
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(footer.previousElementSibling).toHaveClass('gt-card__body');

    rerender(<Card>Body</Card>);
    expect(container.querySelector('.gt-card__header')).toBeNull();
    expect(container.querySelector('.gt-card__footer')).toBeNull();
    // A subtitle with no title has nothing to sit under.
    rerender(<Card subtitle="Alone">Body</Card>);
    expect(container.querySelector('.gt-card__header')).toBeNull();
  });

  it('padded false flushes the body', () => {
    const { container, rerender } = render(<Card>Body</Card>);
    const body = container.querySelector('.gt-card__body')!;
    expect(body).not.toHaveClass('gt-card__body--flush');
    rerender(<Card padded={false}>Body</Card>);
    expect(body).toHaveClass('gt-card__body', 'gt-card__body--flush');
    expect(cssRules('.gt-card__body--flush')[0].getPropertyValue('padding')).toBe('0px');
  });

  it('bordered and shadow classes', () => {
    const { container, rerender } = render(<Card>Body</Card>);
    const card = root(container);
    expect(card).toHaveClass('gt-card--card');
    rerender(<Card shadow="hairline">Body</Card>);
    expect(card).toHaveClass('gt-card--hairline');
    expect(card).not.toHaveClass('gt-card--card');
    rerender(<Card shadow="none">Body</Card>);
    expect(card).toHaveClass('gt-card--none');
    // Bordered has no shadow of its own, whatever `shadow` says.
    rerender(<Card bordered shadow="hairline">Body</Card>);
    expect(card).toHaveClass('gt-card--bordered');
    expect(card).not.toHaveClass('gt-card--hairline');

    expect(cssRules('.gt-card--card')[0].getPropertyValue('box-shadow')).toBe('var(--gt-shadow-card)');
    const [hairline] = cssRules('.gt-card--hairline');
    expect(hairline.getPropertyValue('border')).toBe('1px solid var(--gt-border)');
    expect(hairline.getPropertyValue('box-shadow')).toBe('var(--gt-shadow-hairline)');
    const [bordered] = cssRules('.gt-card--bordered');
    expect(bordered.getPropertyValue('border-radius')).toBe('var(--gt-radius-sm)');
    expect(bordered.getPropertyValue('box-shadow')).toBe('none');
    expect(cssRules('.gt-card--bordered .gt-card__body')[0].getPropertyValue('padding')).toBe('12px 14px');
    expect(cssRules('.gt-card--bordered .gt-card__title')[0].getPropertyValue('font-size')).toBe('14px');
  });

  it('an interactive card is a link with the focus ring on the card', () => {
    const { container } = render(<Card href="/app/projects/p1" title="Bike Share Map" subtitle="Team 4">Live docks</Card>);
    const card = root(container);
    expect(card).toHaveClass('gt-card--interactive');
    const link = screen.getByRole('link', { name: 'Bike Share Map' });
    expect(link).toHaveAttribute('href', '/app/projects/p1');
    expect(link).toHaveClass('gt-card__link');
    expect(link).not.toHaveAttribute('aria-pressed');
    // The title is the link: one name for the whole card.
    expect(link.parentElement).toBe(screen.getByRole('heading', { name: 'Bike Share Map' }));

    // The link stretches over the card, and the card, not the title, takes the ring.
    const [stretch] = cssRules('.gt-card__link::after');
    expect(stretch.getPropertyValue('position')).toBe('absolute');
    expect(stretch.getPropertyValue('inset')).toBe('0px');
    expect(cssRules('.gt-card--interactive:has(.gt-card__link:focus-visible)')[0].getPropertyValue('box-shadow'))
      .toBe('var(--gt-focus-ring)');
    const linkFocus = cssRules('.gt-card__link:focus-visible');
    expect(linkFocus.map((s) => s.getPropertyValue('box-shadow'))).toContain('none');
    expect(cssRules('.gt-card--interactive:hover')[0].getPropertyValue('box-shadow')).toBe('var(--gt-shadow-hover)');
  });

  it('an interactive card is a button, pressed while selected', async () => {
    const onClick = vi.fn();
    const { container, rerender } = render(<Card onClick={onClick} title="CSE 115A">62 students</Card>);
    const button = screen.getByRole('button', { name: 'CSE 115A' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('gt-card__link');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(root(container)).not.toHaveClass('gt-card--selected');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith();

    rerender(<Card onClick={onClick} selected title="CSE 115A">62 students</Card>);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(root(container)).toHaveClass('gt-card--selected');
    rerender(<Card onClick={onClick} selected={false} title="CSE 115A">62 students</Card>);
    expect(button).toHaveAttribute('aria-pressed', 'false');

    const [selected] = cssRules('.gt-card--selected');
    expect(selected.getPropertyValue('outline')).toBe('2px solid var(--gt-primary)');
    expect(selected.getPropertyValue('outline-offset')).toBe('-2px');
  });

  it('an in-app card is a router link, so opening it does not reload the app', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/app/projects']}>
        <Routes>
          <Route path="/app/projects" element={<Card to="/app/projects/p1" title="Bike Share Map">Team 4</Card>} />
          <Route path="/app/projects/p1" element={<p>Project page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(root(container)).toHaveClass('gt-card--interactive');
    const link = screen.getByRole('link', { name: 'Bike Share Map' });
    expect(link).toHaveAttribute('href', '/app/projects/p1');
    expect(link).toHaveClass('gt-card__link');
    await userEvent.click(link);
    expect(screen.getByText('Project page')).toBeInTheDocument();
  });

  it('a selected link card draws the outline and says it is the current one', () => {
    const { container, rerender } = render(<Card href="#p" selected title="SlugEats" />);
    expect(root(container)).toHaveClass('gt-card--selected');
    const link = screen.getByRole('link', { name: 'SlugEats' });
    expect(link).toHaveAttribute('aria-current', 'true');
    expect(link).not.toHaveAttribute('aria-pressed');
    rerender(<Card href="#p" title="SlugEats" />);
    expect(screen.getByRole('link', { name: 'SlugEats' })).not.toHaveAttribute('aria-current');
    rerender(<MemoryRouter><Card to="/app/projects/p2" selected title="SlugEats" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'SlugEats' })).toHaveAttribute('aria-current', 'true');
    // A button card says it with aria-pressed instead.
    rerender(<Card onClick={() => {}} selected title="SlugEats" />);
    expect(screen.getByRole('button', { name: 'SlugEats' })).not.toHaveAttribute('aria-current');
  });

  it('renders a 0 but leaves out an empty string or false', () => {
    const { container, rerender } = render(<Card title="Team" subtitle={0} actions={0} footer={0}>Body</Card>);
    expect(container.querySelector('.gt-card__subtitle')).toHaveTextContent('0');
    expect(container.querySelector('.gt-card__actions')).toHaveTextContent('0');
    expect(container.querySelector('.gt-card__footer')).toHaveTextContent('0');
    rerender(<Card title="Team" subtitle="" actions={false} footer="">Body</Card>);
    expect(container.querySelector('.gt-card__subtitle')).toBeNull();
    expect(container.querySelector('.gt-card__actions')).toBeNull();
    expect(container.querySelector('.gt-card__footer')).toBeNull();
    // A title of 0 is a heading; an empty one leaves no header at all.
    rerender(<Card title={0}>Body</Card>);
    expect(screen.getByRole('heading', { name: '0' })).toBeInTheDocument();
    rerender(<Card title="">Body</Card>);
    expect(container.querySelector('.gt-card__header')).toBeNull();
    rerender(<Card header="">Body</Card>);
    expect(container.querySelector('.gt-card__header')).toBeNull();
  });

  it('actions sit in the header, above the stretched title', async () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    const { container } = render(
      <Card
        onClick={onClick}
        title="Team"
        actions={<button type="button" onClick={onAction}>Manage team</button>}
        footer={<button type="button">Deny</button>}
      >
        Body
      </Card>,
    );
    const actions = container.querySelector('.gt-card__actions')!;
    expect(actions.parentElement).toHaveClass('gt-card__header');
    expect(actions.previousElementSibling).toHaveClass('gt-card__heading');
    await userEvent.click(within(actions as HTMLElement).getByRole('button', { name: 'Manage team' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();

    // Actions and the footer stack above the stretch, so they stay their own targets.
    const [above] = cssRules('.gt-card__actions');
    expect(above.getPropertyValue('position')).toBe('relative');
    expect(above.getPropertyValue('z-index')).toBe('1');
    expect(cssRules('.gt-card__footer')[0].getPropertyValue('z-index')).toBe('1');
  });

  it('a card with actions and no title still has a header', () => {
    const { container } = render(<Card actions={<button type="button">More</button>}>Body</Card>);
    expect(container.querySelector('.gt-card__header .gt-card__actions')).not.toBeNull();
  });

  it('is no target without a title, and types say an interactive card needs one', () => {
    // Untyped callers can still leave it out: the card then stays a plain surface.
    const untitled = { href: '/x' } as unknown as { href: string; title: string };
    const { container } = render(<Card {...untitled}>Body</Card>);
    expect(root(container)).not.toHaveClass('gt-card--interactive');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    // @ts-expect-error: a link card needs a title, which becomes the link
    const noLinkTitle = <Card href="/x">Body</Card>;
    // @ts-expect-error: a button card needs a title, which becomes the button
    const noButtonTitle = <Card onClick={() => {}}>Body</Card>;
    // @ts-expect-error: an interactive card's title is its target, so it takes no custom header
    const headed = <Card onClick={() => {}} title="T" header={<div>H</div>}>Body</Card>;
    // @ts-expect-error: one target, a link or a button
    const both = <Card href="/x" onClick={() => {}} title="T">Body</Card>;
    // @ts-expect-error: a router link card needs a title too
    const noRouteTitle = <Card to="/x">Body</Card>;
    // @ts-expect-error: one link, in-app or not
    const twoLinks = <Card to="/x" href="/y" title="T">Body</Card>;
    // @ts-expect-error: a router link card's title is its target too
    const routeHeaded = <Card to="/x" title="T" header={<div>H</div>}>Body</Card>;
    expect([noLinkTitle, noButtonTitle, headed, both, noRouteTitle, twoLinks, routeHeaded]).toHaveLength(7);
  });

  it('passes className, native props and ref to its root', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<Card className="x" data-key="c" aria-label="Team card" ref={ref}>Body</Card>);
    expect(ref.current).toBe(root(container));
    expect(ref.current).toHaveClass('gt-card', 'gt-card--card', 'x');
    expect(ref.current).toHaveAttribute('data-key', 'c');
    expect(ref.current).toHaveAttribute('aria-label', 'Team card');
  });

  it('clips nothing itself: flush content rounds to the card’s corners, and the card rings a focused flush child', () => {
    const { container, rerender } = render(<Card shadow="hairline" padded={false}><div tabIndex={0}>Rows</div></Card>);
    // A tooltip, menu or popover in the header's actions can leave the card, and a ring can show.
    expect(cssRules('.gt-card')[0].getPropertyValue('overflow')).toBe('');
    const body = container.querySelector('.gt-card__body--flush')!;
    // With no header or footer, the flush body meets all four corners and clips its content to them.
    expect(body).toBe(root(container).firstElementChild);
    expect(body).toBe(root(container).lastElementChild);
    expect(cssRules('.gt-card__body--flush').map((s) => s.getPropertyValue('overflow'))).toContain('hidden');
    const [top] = cssRules('.gt-card__body--flush:first-child');
    expect(top.getPropertyValue('border-top-left-radius')).toBe('inherit');
    expect(top.getPropertyValue('border-top-right-radius')).toBe('inherit');
    const [bottom] = cssRules('.gt-card__body--flush:last-child');
    expect(bottom.getPropertyValue('border-bottom-left-radius')).toBe('inherit');
    expect(bottom.getPropertyValue('border-bottom-right-radius')).toBe('inherit');
    // Its clip hides a focused child's own ring, so the card rings itself, as an interactive card does.
    expect(cssRules('.gt-card:has(> .gt-card__body--flush > :focus-visible)')[0].getPropertyValue('box-shadow'))
      .toBe('var(--gt-focus-ring)');
    // Under a header and over a footer it meets no corner.
    rerender(<Card shadow="hairline" padded={false} title="Roster" footer={<span>3 more</span>}>Rows</Card>);
    expect(body.previousElementSibling).toHaveClass('gt-card__header');
    expect(body.nextElementSibling).toHaveClass('gt-card__footer');
  });

  it('rounds the stretch to the card’s own corners, now that the card does not clip it', () => {
    render(<Card href="#p" title="SlugEats" />);
    expect(cssRules('.gt-card__link::after')[0].getPropertyValue('border-radius')).toBe('var(--gt-radius-md)');
    expect(cssRules('.gt-card--bordered .gt-card__link::after')[0].getPropertyValue('border-radius')).toBe('var(--gt-radius-sm)');
  });

  it('ports the card block, and sets what the global button rule would on the stretched button', () => {
    render(<Card onClick={() => {}} title="T" />);
    const [card] = cssRules('.gt-card');
    expect(card.getPropertyValue('position')).toBe('relative');
    expect(card.getPropertyValue('border-radius')).toBe('var(--gt-radius-md)');
    const [link] = cssRules('.gt-card__link');
    expect(link.getPropertyValue('padding')).toBe('0px');
    expect(link.getPropertyValue('border-style')).toBe('none');
    expect(link.getPropertyValue('background')).toBe('none');
    expect(link.getPropertyValue('font')).toBe('inherit');
    expect(link.getPropertyValue('text-align')).toBe('inherit');
    // index.css gives every button an 8px radius.
    expect(cssRules('.gt-card__link').map((s) => s.getPropertyValue('border-radius'))).toContain('0px');
    expect(cssRules('.gt-card__title')[0].getPropertyValue('font-size')).toBe('1.35rem');
    expect(cssRules('.gt-card--interactive', 'prefers-reduced-motion')[0].getPropertyValue('transition')).toBe('none');
  });
});
