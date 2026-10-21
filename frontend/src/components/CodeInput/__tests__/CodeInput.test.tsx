import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { CodeInput, type CodeInputProps } from '../CodeInput';

/** A join code field that keeps its value, as a page would. */
function Code({ initial = '', ...props }: { initial?: string } & Partial<CodeInputProps>) {
  const [code, setCode] = useState(initial);
  return <CodeInput label="Class code" length={8} {...props} value={code} onChange={(next) => { props.onChange?.(next); setCode(next); }} />;
}

const box = (n: number, of = 8, noun = 'Character') => screen.getByRole('textbox', { name: `${noun} ${n} of ${of}` });
const values = () => within(screen.getByRole('group')).getAllByRole('textbox').map((b) => (b as HTMLInputElement).value).join('|');

describe('CodeInput', () => {
  it('is one group named by its label, with a box per character', () => {
    render(<Code helperText="8 characters from your instructor" />);
    const group = screen.getByRole('group', { name: 'Class code' });
    expect(group).toHaveClass('gt-code');
    expect(group).toHaveAccessibleDescription('8 characters from your instructor');
    const boxes = within(group).getAllByRole('textbox');
    expect(boxes).toHaveLength(8);
    expect(boxes[0]).toHaveAccessibleName('Character 1 of 8');
    expect(boxes[7]).toHaveAccessibleName('Character 8 of 8');
    expect(screen.getByText('Class code').tagName).toBe('SPAN');
  });

  it('lets the first box take a one-time code from autofill', () => {
    render(<Code id="join-code" />);
    expect(box(1)).toHaveAttribute('autocomplete', 'one-time-code');
    expect(box(1)).toHaveAttribute('id', 'join-code');
    expect(box(2)).toHaveAttribute('autocomplete', 'off');
    expect(box(1)).toHaveAttribute('inputmode', 'text');
    expect(box(1)).toHaveAttribute('autocapitalize', 'characters');
  });

  it('upper-cases what is typed, fills the box and moves to the next', async () => {
    const onChange = vi.fn();
    render(<Code onChange={onChange} />);
    await userEvent.click(box(1));
    await userEvent.keyboard('a');
    expect(onChange).toHaveBeenLastCalledWith('A');
    expect(box(1)).toHaveValue('A');
    expect(box(2)).toHaveFocus();
    await userEvent.keyboard('b7');
    expect(values()).toBe('A|B|7|||||');
    expect(box(4)).toHaveFocus();
  });

  it('refuses what a code cannot hold', async () => {
    const onChange = vi.fn();
    render(<Code onChange={onChange} />);
    await userEvent.click(box(1));
    await userEvent.keyboard('-');
    expect(onChange).not.toHaveBeenCalled();
    expect(box(1)).toHaveValue('');
    expect(box(1)).toHaveFocus();
  });

  it('takes digits only in numeric mode, with the numeric keyboard', async () => {
    const onChange = vi.fn();
    render(<Code label="Verification code" length={6} numeric onChange={onChange} />);
    const first = box(1, 6, 'Digit');
    expect(first).toHaveAttribute('inputmode', 'numeric');
    await userEvent.click(first);
    await userEvent.keyboard('a');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('4');
    expect(onChange).toHaveBeenLastCalledWith('4');
    expect(box(2, 6, 'Digit')).toHaveFocus();
  });

  it('fills every box from a paste, dropping what does not belong, and focuses the next empty one', async () => {
    render(<Code />);
    await userEvent.click(box(1));
    await userEvent.paste('ab-12 34');
    expect(values()).toBe('A|B|1|2|3|4||');
    expect(box(7)).toHaveFocus();
  });

  it('stops a long paste at the last box', async () => {
    const onComplete = vi.fn();
    render(<Code onComplete={onComplete} />);
    await userEvent.click(box(1));
    await userEvent.paste('qwer-1234-zz');
    expect(values()).toBe('Q|W|E|R|1|2|3|4');
    expect(box(8)).toHaveFocus();
    expect(onComplete).toHaveBeenCalledWith('QWER1234');
  });

  it('calls onComplete once every box is filled', async () => {
    const onComplete = vi.fn();
    render(<Code label="Verification code" length={6} numeric onComplete={onComplete} />);
    await userEvent.click(box(1, 6, 'Digit'));
    await userEvent.keyboard('48213');
    expect(onComplete).not.toHaveBeenCalled();
    await userEvent.keyboard('9');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('482139');
  });

  it('Backspace clears the box, or on an empty box steps back and clears the previous one', async () => {
    render(<Code initial="ABC" />);
    await userEvent.click(box(3));
    await userEvent.keyboard('{Backspace}');
    expect(values()).toBe('A|B||||||');
    expect(box(3)).toHaveFocus();
    await userEvent.keyboard('{Backspace}');
    expect(values()).toBe('A|||||||');
    expect(box(2)).toHaveFocus();
    await userEvent.click(box(1));
    await userEvent.keyboard('{Backspace}{Backspace}');
    expect(values()).toBe('|||||||');
    expect(box(1)).toHaveFocus();
  });

  it('moves between boxes with the arrow keys, Home and End', async () => {
    render(<Code initial="ABCD" />);
    await userEvent.click(box(2));
    await userEvent.keyboard('{ArrowRight}');
    expect(box(3)).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(box(1)).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(box(5)).toHaveFocus();
    // No further than the first empty box: the value has no holes.
    await userEvent.keyboard('{ArrowRight}');
    expect(box(5)).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(box(1)).toHaveFocus();
  });

  it('lands a tap past the value on the first empty box, so the row is one target', async () => {
    render(<Code initial="AB" />);
    await userEvent.click(box(6));
    expect(box(3)).toHaveFocus();
  });

  it('focuses the first empty box on mount with autoFocus', () => {
    render(<Code initial="48" label="Verification code" length={6} numeric autoFocus />);
    expect(box(3, 6, 'Digit')).toHaveFocus();
  });

  it('is described by its error, which marks every box invalid', () => {
    render(<Code initial="QWERTY12" error="That code doesn't match a class. Check it with your instructor." />);
    const group = screen.getByRole('group', { name: 'Class code' });
    expect(group).toHaveAccessibleDescription("That code doesn't match a class. Check it with your instructor.");
    within(group).getAllByRole('textbox').forEach((b) => expect(b).toHaveAttribute('aria-invalid', 'true'));
  });

  it('disables every box', () => {
    const { container } = render(<Code initial="123456" length={6} disabled />);
    within(screen.getByRole('group')).getAllByRole('textbox').forEach((b) => expect(b).toBeDisabled());
    expect(container.firstChild).toHaveClass('gt-field--disabled');
  });

  it('draws a decorative rule between groups of boxes', () => {
    const { container } = render(<Code groupSize={4} />);
    const seps = container.querySelectorAll('.gt-code__sep');
    expect(seps).toHaveLength(1);
    expect(seps[0]).toHaveAttribute('aria-hidden', 'true');
    expect(seps[0].previousElementSibling).toBe(box(4));
  });

  it('works uncontrolled', async () => {
    const onChange = vi.fn();
    render(<CodeInput label="Verification code" numeric onChange={onChange} />);
    await userEvent.click(box(1, 6, 'Digit'));
    await userEvent.keyboard('12');
    expect(box(1, 6, 'Digit')).toHaveValue('1');
    expect(box(2, 6, 'Digit')).toHaveValue('2');
    expect(onChange).toHaveBeenLastCalledWith('12');
  });

  it('cleans a value it is given, and passes ref to the first box and className to the field', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(<CodeInput label="Class code" length={8} value="ab-cd" onChange={() => {}} className="x" ref={ref} />);
    expect(ref.current).toBe(box(1));
    expect(values()).toBe('A|B|C|D||||');
    expect(container.firstChild).toHaveClass('gt-field', 'x');
  });

  it('draws its boxes with the control border and tightens the gap on phones', () => {
    render(<Code />);
    const [boxRule] = cssRules('.gt-code__box');
    expect(boxRule.getPropertyValue('border')).toContain('var(--gt-border-control)');
    expect(boxRule.getPropertyValue('font-family')).toBe('var(--gt-font-mono)');
    const [phone] = cssRules('.gt-code', 'max-width: 767px');
    expect(phone.getPropertyValue('gap')).toBe('6px');
  });
});
