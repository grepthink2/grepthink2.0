import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { cssRules } from '@/test/cssRules';
import { HOVER_CLOSE_MS, HOVER_OPEN_MS, PersonLink } from '../PersonLink';
import { PersonHoverCard } from '../PersonHoverCard';

const bo = { id: 'u1', name: 'Bo Park' };
const lines = { roleLine: 'Student · CSE 115A', teamLine: 'Trailhead · Product Owner' };
const link = () => screen.getByRole('link', { name: 'Bo Park' });
const card = () => document.querySelector('.gt-person-card');
const show = (ui: React.ReactElement) => render(ui, { wrapper: MemoryRouter });

describe('PersonLink', () => {
  it('links to the person, plain by default', () => {
    show(<PersonLink person={bo} />);
    expect(link()).toHaveAttribute('href', '/app/people/u1');
    expect(link()).toHaveClass('gt-person-link', 'gt-person-link--plain');
    expect(link().closest('.gt-person-link-wrap')).toBeNull();
  });

  it('inline has its own class, children replace the name, and `to` the address', () => {
    show(
      <PersonLink person={bo} variant="inline" to="/elsewhere" className="mine" data-testid="who">
        Bo
      </PersonLink>,
    );
    const short = screen.getByRole('link', { name: 'Bo' });
    expect(short).toHaveClass('gt-person-link', 'gt-person-link--inline', 'mine');
    expect(short).toHaveAttribute('href', '/elsewhere');
    expect(short).toHaveAttribute('data-testid', 'who');
  });

  it('keeps the colour of the text around it, and underlines an inline link at rest', () => {
    show(<PersonLink person={bo} />);
    expect(cssRules('.gt-person-link')[0].getPropertyValue('color')).toBe('inherit');
    expect(cssRules('.gt-person-link--inline')[0].getPropertyValue('text-decoration-line')).toBe('underline');
    expect(cssRules('.gt-person-link:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring-tight)');
  });

  describe('with a card', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    const rest = (pointerType = 'mouse') => fireEvent.pointerEnter(link(), { pointerType });

    it('a mouse that rests opens the card after its delay', () => {
      show(<PersonLink person={bo} card={lines} />);
      expect(HOVER_OPEN_MS).toBe(150);
      rest();
      wait(149);
      expect(card()).toBeNull();
      wait(1);
      expect(screen.getByText('Student · CSE 115A')).toBeInTheDocument();
      expect(screen.getByText('Trailhead · Product Owner')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/app/people/u1');
      expect(card()?.closest('.gt-popover')).toHaveClass('gt-popover--sm', 'gt-person-link__popover');
    });

    it('closes after its grace once the pointer leaves, and stays while the pointer is on the card', () => {
      show(<PersonLink person={bo} card={lines} />);
      expect(HOVER_CLOSE_MS).toBe(300);
      rest();
      wait(150);
      fireEvent.pointerLeave(link(), { pointerType: 'mouse' });
      wait(299);
      expect(card()).not.toBeNull();
      fireEvent.pointerEnter(card()!, { pointerType: 'mouse' });
      wait(1000);
      expect(card()).not.toBeNull();
      fireEvent.pointerLeave(card()!, { pointerType: 'mouse' });
      wait(299);
      expect(card()).not.toBeNull();
      wait(1);
      expect(card()).toBeNull();
    });

    it('a pointer that leaves before the delay opens nothing', () => {
      show(<PersonLink person={bo} card={lines} />);
      rest();
      wait(100);
      fireEvent.pointerLeave(link(), { pointerType: 'mouse' });
      wait(1000);
      expect(card()).toBeNull();
    });

    it('Esc closes it', () => {
      show(<PersonLink person={bo} card={lines} />);
      rest();
      wait(150);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(card()).toBeNull();
    });

    it('following the link closes it', () => {
      show(<PersonLink person={bo} card={lines} />);
      rest();
      wait(150);
      fireEvent.click(link());
      expect(card()).toBeNull();
    });

    it.each(['touch', 'pen'])('never opens for %s', (pointerType) => {
      show(<PersonLink person={bo} card={lines} />);
      rest(pointerType);
      wait(1000);
      expect(card()).toBeNull();
    });

    it('never opens on keyboard focus', () => {
      show(<PersonLink person={bo} card={lines} />);
      act(() => link().focus());
      wait(1000);
      expect(link()).toHaveFocus();
      expect(card()).toBeNull();
    });

    it('opens nothing for a link without card lines', () => {
      show(<PersonLink person={bo} />);
      rest();
      wait(1000);
      expect(card()).toBeNull();
    });

    describe('where the card goes', () => {
      // jsdom lays nothing out, so the name's box and the card's size are given.
      const at = (left: number, top: number) =>
        ({ left, top, right: left + 80, bottom: top + 20, width: 80, height: 20, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
      const openAt = (left: number, top: number) => {
        show(<PersonLink person={bo} card={lines} />);
        vi.spyOn(link(), 'getBoundingClientRect').mockReturnValue(at(left, top));
        rest();
        wait(150);
        return card()!.closest('.gt-popover') as HTMLElement;
      };
      beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120);
      });
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('is placed against the window, under the name, so a cell that clips cannot cut it', () => {
        const popover = openAt(100, 30);
        expect(cssRules('.gt-popover.gt-person-link__popover')[0].getPropertyValue('position')).toBe('fixed');
        expect(popover.style.top).toBe('56px');
        expect(popover.style.left).toBe('100px');
      });

      it('goes above the name when there is no room under it', () => {
        const popover = openAt(100, window.innerHeight - 40);
        expect(popover.style.top).toBe(`${window.innerHeight - 40 - 6 - 120}px`);
      });

      it('stays under the name when there is no room above either', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(window.innerHeight);
        const popover = openAt(100, 30);
        expect(popover.style.top).toBe('56px');
      });

      it('stays inside the window on the right', () => {
        expect(openAt(window.innerWidth - 50, 30).style.left).toBe(`${window.innerWidth - 280 - 8}px`);
      });

      it('stays inside the window on the left', () => {
        expect(openAt(-40, 30).style.left).toBe('8px');
      });

      it('closes when the page scrolls or the window changes size, since it would be left behind', () => {
        openAt(100, 30);
        fireEvent.scroll(document.body);
        expect(card()).toBeNull();
        rest();
        wait(150);
        expect(card()).not.toBeNull();
        fireEvent(window, new Event('resize'));
        expect(card()).toBeNull();
      });

      it('lets a long name shrink to its cell, and keeps the cell from styling the card', () => {
        expect(cssRules('.gt-person-link-wrap .gt-person-link')[0].getPropertyValue('text-overflow')).toBe('ellipsis');
        expect(cssRules('.gt-person-link-wrap')[0].getPropertyValue('min-width')).toBe('0px');
        expect(cssRules('.gt-person-card')[0].getPropertyValue('white-space')).toBe('normal');
      });
    });

    it('leaves no timer running after it unmounts', () => {
      const { unmount } = show(<PersonLink person={bo} card={lines} />);
      rest();
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe('PersonHoverCard', () => {
  it('shows the avatar, the name, the lines it was given and the way to the page', () => {
    show(<PersonHoverCard person={bo} roleLine="TA · CSE 115A" />);
    expect(screen.getByText('Bo Park')).toHaveClass('gt-person-card__name');
    expect(screen.getByText('TA · CSE 115A')).toHaveClass('gt-person-card__line');
    expect(document.querySelectorAll('.gt-person-card__line')).toHaveLength(1);
    expect(document.querySelector('.gt-person-card .gt-avatar')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/app/people/u1');
  });
});
