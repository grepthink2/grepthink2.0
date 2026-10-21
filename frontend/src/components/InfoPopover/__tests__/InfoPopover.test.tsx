import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Modal } from '@/components/Modal/Modal';
import { InfoPopover } from '../InfoPopover';

describe('InfoPopover', () => {
  it('names its trigger with label, toggles aria-expanded and closes on Escape', async () => {
    render(<InfoPopover title="How this is counted" body="Every task in view." label="How Scrum board is counted" />);
    const trigger = screen.getByRole('button', { name: 'How Scrum board is counted' });
    expect(trigger).toHaveClass('gt-infopop__trigger');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Every task in view.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Every task in view.')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a non-modal dialog on the Popover surface, labelled by its title and controlled by the trigger', async () => {
    render(<InfoPopover title="How TSRs are counted" body="Submitted reports this sprint." learnMoreHref="/help/tsrs" />);
    // Without a label, the title names the trigger.
    const trigger = screen.getByRole('button', { name: 'How TSRs are counted' });
    await userEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'How TSRs are counted' });
    expect(panel).not.toHaveAttribute('aria-modal');
    expect(panel).toHaveClass('gt-popover', 'gt-popover--bottom', 'gt-popover--start', 'gt-infopop__panel');
    expect(trigger).toHaveAttribute('aria-controls', panel.id);
    expect(within(panel).getByText('How TSRs are counted')).toHaveClass('gt-infopop__title');
    expect(within(panel).getByText('Submitted reports this sprint.')).toHaveClass('gt-infopop__body');
    expect(within(panel).getByRole('link', { name: 'Learn more' })).toHaveAttribute('href', '/help/tsrs');
  });

  it('opens with Enter, and Esc closes it and leaves focus on the trigger', async () => {
    const user = userEvent.setup();
    render(<InfoPopover title="Why can’t I publish?" body="Add at least one question first." />);
    await user.tab();
    const trigger = screen.getByRole('button', { name: 'Why can’t I publish?' });
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('gives focus back to the trigger when Esc closes it from inside the panel, never traps Tab', async () => {
    const user = userEvent.setup();
    render(<InfoPopover title="How TSRs are counted" body="Late submissions count." learnMoreHref="/help/tsrs" />);
    const trigger = screen.getByRole('button', { name: 'How TSRs are counted' });
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on a press outside, leaving focus alone, and stays open for one inside', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Elsewhere</button>
        <InfoPopover title="How this is counted" body="Every task in view." />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'How this is counted' }));
    fireEvent.mouseDown(screen.getByText('Every task in view.'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
  });

  it('inside a Modal, Esc closes only the popover', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Analytics">
        <InfoPopover title="How this is counted" body="Every task in view." />
      </Modal>,
    );
    await user.click(screen.getByRole('button', { name: 'How this is counted' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Every task in view.')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens above or from the end, and passes className to its wrapper and ref to the trigger', async () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(<InfoPopover title="About" body="Text" placement="top" align="end" className="x" ref={ref} />);
    expect(container.firstChild).toHaveClass('gt-infopop', 'x');
    expect(ref.current).toBe(screen.getByRole('button', { name: 'About' }));
    await userEvent.click(ref.current as HTMLButtonElement);
    expect(screen.getByRole('dialog')).toHaveClass('gt-popover--top', 'gt-popover--end');
  });

  it('is a 24px ⓘ, 44px on phones, over a 352px panel', () => {
    render(<InfoPopover title="About" body="Text" />);
    const [trigger] = cssRules('.gt-infopop__trigger');
    expect(trigger.getPropertyValue('width')).toBe('24px');
    expect(trigger.getPropertyValue('padding')).toBe('0px');
    expect(cssRules('.gt-infopop__trigger', 'max-width: 767px')[0].getPropertyValue('width')).toBe('44px');
    expect(cssRules('.gt-infopop__panel')[0].getPropertyValue('width')).toBe('352px');
  });

  describe('on a screen too narrow for the panel at its ⓘ', () => {
    // jsdom has no layout, so each case sizes the viewport, the ⓘ and the open panel (the first with what a 375 px phone measured).
    const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 24, height: 24, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    const layout = (viewport: number, triggerLeft: number, panelWidth: number) => {
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(viewport);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('gt-infopop__trigger')) return rect(triggerLeft, 24);
        if (this.classList.contains('gt-popover')) return rect(triggerLeft, panelWidth);
        return rect(0, 0);
      });
    };
    const open = async (align: 'start' | 'end' = 'start') => {
      render(<InfoPopover title="How this is counted" body="Every message in view." label="How Conversations is counted" align={align} />);
      await userEvent.click(screen.getByRole('button', { name: 'How Conversations is counted' }));
      return screen.getByText('Every message in view.').closest('.gt-popover') as HTMLElement;
    };
    afterEach(() => vi.restoreAllMocks());

    it('moves the panel left until its right edge is 8 px inside the viewport', async () => {
      layout(375, 153, 354);
      expect((await open()).style.left).toBe('-140px'); // its left edge lands at 375 − 8 − 354 = 13
    });
    it('never moves it past the left edge: a panel with less than 16 px to spare is centred', async () => {
      layout(360, 153, 346);
      expect((await open()).style.left).toBe('-146px'); // (360 − 346) / 2 = 7 on either side
    });
    it('leaves the panel at its ⓘ where it fits', async () => {
      layout(1400, 600, 354);
      expect((await open()).style.left).toBe('');
    });
    it('keeps an end-aligned panel 8 px inside the left edge, moving its right side', async () => {
      // The ⓘ at 20–44: a 354 px panel ending at 44 would start at −310; it moves 318 px right, to 8.
      layout(1400, 20, 354);
      const panel = await open('end');
      expect(panel.style.right).toBe('-318px');
      expect(panel.style.left).toBe('');
    });
    it('measures again when the window resizes', async () => {
      layout(1400, 153, 354);
      const panel = await open();
      expect(panel.style.left).toBe('');
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(375);
      fireEvent(window, new Event('resize'));
      expect(panel.style.left).toBe('-140px');
    });
  });
});
