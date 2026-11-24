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
