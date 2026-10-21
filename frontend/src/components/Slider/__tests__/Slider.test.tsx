import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Slider, type SliderProps } from '../Slider';

/** A slider whose parent keeps the value, as a form does. */
function Controlled({ initial = 0, onChange, ...props }: SliderProps & { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <Slider
      {...props}
      value={value}
      onChange={(n) => {
        setValue(n);
        onChange?.(n);
      }}
    />
  );
}

describe('Slider', () => {
  it('is a range named by its label, with its value beside the track and in aria-valuetext', () => {
    const { container } = render(<Slider label="Your share" unit="%" defaultValue={25} />);
    const slider = screen.getByRole('slider', { name: 'Your share' });
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveClass('gt-slider__input');
    expect(slider).toHaveValue('25');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveAttribute('step', '1');
    expect(slider).toHaveAttribute('aria-valuetext', '25%');

    // The text beside the track repeats aria-valuetext, so screen readers skip it.
    const shown = container.querySelector('output.gt-slider__value');
    expect(shown).toHaveTextContent('25%');
    expect(shown).toHaveAttribute('aria-hidden', 'true');
    expect(shown).toHaveAttribute('for', slider.id);
    expect(container.querySelector('.gt-slider__track')).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveClass('gt-field', 'gt-slider');
  });

  it('shows formatValue beside the track and to screen readers, and valueText to screen readers only', () => {
    const points = (n: number) => `${n} pts`;
    const { container, rerender } = render(<Slider label="Points" defaultValue={3} formatValue={points} />);
    const slider = screen.getByRole('slider', { name: 'Points' });
    expect(container.querySelector('.gt-slider__value')).toHaveTextContent('3 pts');
    expect(slider).toHaveAttribute('aria-valuetext', '3 pts');

    rerender(<Slider label="Points" defaultValue={3} formatValue={points} valueText={(n) => `${n} of 100 points`} />);
    expect(container.querySelector('.gt-slider__value')).toHaveTextContent('3 pts');
    expect(slider).toHaveAttribute('aria-valuetext', '3 of 100 points');
  });

  it('keeps a hidden label as its name, and says when it is optional', () => {
    const { rerender } = render(<Slider label="Share" hideLabel />);
    expect(screen.getByRole('slider', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByText('Share')).toHaveClass('gt-visually-hidden');

    rerender(<Slider label="Share" optional />);
    expect(screen.getByRole('slider', { name: 'Share (optional)' })).toBeInTheDocument();
  });

  it('starts at min with neither value nor defaultValue', () => {
    render(<Slider label="Hours" min={2} max={12} />);
    expect(screen.getByRole('slider', { name: 'Hours' })).toHaveValue('2');
  });

  it('works uncontrolled from defaultValue, reporting each new number', () => {
    const onChange = vi.fn();
    const { container } = render(<Slider label="Share" unit="%" defaultValue={25} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    fireEvent.change(slider, { target: { value: '40' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(40);
    expect(slider).toHaveValue('40');
    expect(slider).toHaveAttribute('aria-valuetext', '40%');
    expect(container.querySelector('.gt-slider__value')).toHaveTextContent('40%');
  });

  it('works controlled, showing the value it is given', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Slider label="Share" unit="%" value={30} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    fireEvent.change(slider, { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(45);
    // Until the parent passes the new value, the slider keeps the old one.
    expect(slider).toHaveValue('30');
    expect(slider).toHaveAttribute('aria-valuetext', '30%');

    rerender(<Slider label="Share" unit="%" value={45} onChange={onChange} />);
    expect(slider).toHaveValue('45');
    expect(slider).toHaveAttribute('aria-valuetext', '45%');
  });

  it('snaps to step and clamps to min…max, what it reports and what it shows', () => {
    const onChange = vi.fn();
    const { unmount } = render(<Controlled label="Share" step={5} initial={20} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    fireEvent.change(slider, { target: { value: '33' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(35);
    expect(slider).toHaveValue('35');
    unmount();

    const { rerender } = render(<Slider label="Share" unit="%" value={140} />);
    const shown = screen.getByRole('slider', { name: 'Share' });
    expect(shown).toHaveValue('100');
    expect(shown).toHaveAttribute('aria-valuetext', '100%');
    rerender(<Slider label="Share" unit="%" value={-5} />);
    expect(shown).toHaveAttribute('aria-valuetext', '0%');
    rerender(<Slider label="Share" unit="%" step={5} value={33} />);
    expect(shown).toHaveAttribute('aria-valuetext', '35%');
  });

  it('stops at the last step inside max when the range is not a whole number of steps', async () => {
    const onChange = vi.fn();
    const { unmount } = render(<Controlled label="Points" max={10} step={3} initial={6} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Points' });
    slider.focus();
    await userEvent.keyboard('{PageUp}{PageUp}');
    // 9 is the last value the browser's range can hold: 12 is past max, and 10 is not a step.
    expect(onChange.mock.calls).toEqual([[9]]);
    expect(slider).toHaveValue('9');
    unmount();

    render(<Slider label="Points" max={10} step={3} value={10} />);
    expect(screen.getByRole('slider', { name: 'Points' })).toHaveAttribute('aria-valuetext', '9');
  });

  it('keeps decimal steps free of floating-point noise', async () => {
    const onChange = vi.fn();
    render(<Slider label="Weight" max={1} step={0.1} defaultValue={0.2} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Weight' });
    slider.focus();
    // 0.2 + 0.1 is 0.30000000000000004 in floating point.
    await userEvent.keyboard('{PageUp}');
    expect(onChange).toHaveBeenLastCalledWith(0.3);
    expect(slider).toHaveAttribute('aria-valuetext', '0.3');
    await userEvent.keyboard('{PageUp}');
    expect(onChange).toHaveBeenLastCalledWith(0.4);
  });

  it('moves a tenth of the range on PageUp and PageDown by default', async () => {
    const onChange = vi.fn();
    render(<Controlled label="Share" initial={50} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    slider.focus();
    await userEvent.keyboard('{PageUp}');
    expect(slider).toHaveValue('60');
    await userEvent.keyboard('{PageDown}{PageDown}');
    expect(slider).toHaveValue('40');
    expect(onChange.mock.calls).toEqual([[60], [50], [40]]);
  });

  it('moves at least one step on PageUp, or pageStep when it is given', async () => {
    const { unmount } = render(<Controlled label="Rating" max={4} initial={1} />);
    const rating = screen.getByRole('slider', { name: 'Rating' });
    rating.focus();
    // A tenth of 0…4 is 0.4, less than the step of 1.
    await userEvent.keyboard('{PageUp}');
    expect(rating).toHaveValue('2');
    unmount();

    render(<Controlled label="Share" pageStep={25} />);
    const share = screen.getByRole('slider', { name: 'Share' });
    share.focus();
    await userEvent.keyboard('{PageUp}');
    expect(share).toHaveValue('25');
  });

  it('takes PageUp and PageDown from the browser, and leaves it the other keys', () => {
    render(<Slider label="Share" defaultValue={50} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    // fireEvent returns false when a handler prevented the default.
    expect(fireEvent.keyDown(slider, { key: 'PageUp' })).toBe(false);
    expect(fireEvent.keyDown(slider, { key: 'PageDown' })).toBe(false);
    expect(fireEvent.keyDown(slider, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(slider, { key: 'Home' })).toBe(true);
  });

  it('calls onChange only when the value changes', async () => {
    const onChange = vi.fn();
    render(<Slider label="Share" step={5} max={50} defaultValue={0} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    slider.focus();
    await userEvent.keyboard('{PageDown}');
    // 2 snaps back to 0.
    fireEvent.change(slider, { target: { value: '2' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(slider, { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(50);
    await userEvent.keyboard('{PageUp}');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("runs a caller's onKeyDown first, and keeps the value when it prevents the key's default", async () => {
    const onKeyDown = vi.fn();
    const { unmount } = render(<Controlled label="Share" onKeyDown={onKeyDown} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    slider.focus();
    await userEvent.keyboard('{PageUp}');
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(slider).toHaveValue('10');
    unmount();

    render(<Controlled label="Share" onKeyDown={(e) => e.preventDefault()} />);
    const held = screen.getByRole('slider', { name: 'Share' });
    held.focus();
    await userEvent.keyboard('{PageUp}');
    expect(held).toHaveValue('0');
  });

  describe('withInput', () => {
    it('pairs a compact number input named "{label} exact value", in step with the slider', () => {
      const { container } = render(<Controlled label="Tony Wu" unit="%" withInput initial={40} />);
      const slider = screen.getByRole('slider', { name: 'Tony Wu' });
      const exact = screen.getByRole('spinbutton', { name: 'Tony Wu exact value' });
      expect(exact).toHaveValue(40);
      expect(exact).toHaveClass('gt-input', 'gt-input--compact', 'gt-slider__number-input');
      expect(exact).toHaveAttribute('min', '0');
      expect(exact).toHaveAttribute('max', '100');
      expect(exact).toHaveAttribute('step', '1');
      expect(container.querySelector('.gt-slider__value')).toBeNull();
      const unit = container.querySelector('.gt-slider__unit');
      expect(unit).toHaveTextContent('%');
      expect(unit).toHaveAttribute('aria-hidden', 'true');

      fireEvent.change(slider, { target: { value: '70' } });
      expect(exact).toHaveValue(70);
    });

    it('shows no unit after the input without one', () => {
      const { container } = render(<Slider label="Points" withInput />);
      expect(screen.getByRole('spinbutton', { name: 'Points exact value' })).toHaveValue(0);
      expect(container.querySelector('.gt-slider__unit')).toBeNull();
    });

    it('moves the slider at once to a value typed in range', async () => {
      const onChange = vi.fn();
      render(<Controlled label="Tony Wu" unit="%" withInput initial={40} onChange={onChange} />);
      const slider = screen.getByRole('slider', { name: 'Tony Wu' });
      const exact = screen.getByRole('spinbutton', { name: 'Tony Wu exact value' });
      await userEvent.clear(exact);
      await userEvent.type(exact, '55');
      expect(exact).toHaveFocus();
      expect(onChange.mock.calls).toEqual([[5], [55]]);
      expect(slider).toHaveValue('55');
      expect(slider).toHaveAttribute('aria-valuetext', '55%');
    });

    it('clamps a value typed past max on blur', async () => {
      const onChange = vi.fn();
      render(<Controlled label="Tony Wu" unit="%" withInput initial={40} onChange={onChange} />);
      const slider = screen.getByRole('slider', { name: 'Tony Wu' });
      const exact = screen.getByRole('spinbutton', { name: 'Tony Wu exact value' });
      await userEvent.clear(exact);
      await userEvent.type(exact, '150');
      // 150 is out of range, so typing it moved the slider no further than 15.
      expect(onChange).toHaveBeenLastCalledWith(15);
      expect(exact).toHaveValue(150);

      await userEvent.tab();
      expect(onChange).toHaveBeenLastCalledWith(100);
      expect(exact).toHaveValue(100);
      expect(slider).toHaveValue('100');
    });

    it('snaps a value typed between steps, showing the step once it loses focus', async () => {
      const onChange = vi.fn();
      render(<Controlled label="Share" withInput step={5} initial={20} onChange={onChange} />);
      const exact = screen.getByRole('spinbutton', { name: 'Share exact value' });
      await userEvent.clear(exact);
      await userEvent.type(exact, '33');
      expect(onChange).toHaveBeenLastCalledWith(35);
      expect(exact).toHaveValue(33);
      await userEvent.tab();
      expect(exact).toHaveValue(35);
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('puts the value back when the entry is left empty', async () => {
      const onChange = vi.fn();
      render(<Controlled label="Tony Wu" withInput initial={40} onChange={onChange} />);
      const exact = screen.getByRole('spinbutton', { name: 'Tony Wu exact value' });
      // Through without typing: nothing to commit.
      await userEvent.click(exact);
      await userEvent.tab();
      expect(exact).toHaveValue(40);

      await userEvent.clear(exact);
      expect(exact).toHaveValue(null);
      await userEvent.tab();
      expect(exact).toHaveValue(40);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('gives each number input of a form its own name', () => {
      render(
        <>
          <Slider label="Ashton Liu" withInput />
          <Slider label="Tony Wu" withInput />
        </>,
      );
      expect(screen.getByRole('spinbutton', { name: 'Ashton Liu exact value' })).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: 'Tony Wu exact value' })).toBeInTheDocument();
      const [a, b] = screen.getAllByRole('slider');
      expect(a.id).not.toBe(b.id);
    });
  });

  it('is described by its help line, or by its error, which marks both inputs invalid', () => {
    const { container, rerender } = render(<Slider label="Joshua Cruz" withInput helperText="Your share of the sprint" />);
    const slider = screen.getByRole('slider', { name: 'Joshua Cruz' });
    const exact = screen.getByRole('spinbutton', { name: 'Joshua Cruz exact value' });
    for (const input of [slider, exact]) {
      expect(input).toHaveAccessibleDescription('Your share of the sprint');
      expect(input).not.toHaveAttribute('aria-invalid');
    }

    rerender(<Slider label="Joshua Cruz" withInput helperText="Your share of the sprint" error="Enter a share between 0% and 100%." />);
    for (const input of [slider, exact]) {
      expect(input).toHaveAccessibleDescription('Enter a share between 0% and 100%.');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    }
    expect(container.firstChild).toHaveClass('gt-field--error');
  });

  it('turns the fill and the thumb to the error colour', () => {
    render(<Slider label="Share" error="Too much" />);
    const [fill] = cssRules('.gt-field--error .gt-slider__fill');
    expect(fill.getPropertyValue('background')).toBe('var(--gt-error)');
    const [webkitThumb] = cssRules('.gt-field--error .gt-slider__input::-webkit-slider-thumb');
    expect(webkitThumb.getPropertyValue('background')).toBe('var(--gt-error)');
    const [mozThumb] = cssRules('.gt-field--error .gt-slider__input::-moz-range-thumb');
    expect(mozThumb.getPropertyValue('background')).toBe('var(--gt-error)');
  });

  it('merges a caller aria-describedby with its own lines, on both inputs', () => {
    render(
      <>
        <p id="group-note">Shares add up to 100%.</p>
        <Slider label="Share" withInput helperText="Steps of 5" aria-describedby="group-note" />
      </>,
    );
    expect(screen.getByRole('slider', { name: 'Share' })).toHaveAccessibleDescription('Shares add up to 100%. Steps of 5');
    expect(screen.getByRole('spinbutton', { name: 'Share exact value' })).toHaveAccessibleDescription(
      'Shares add up to 100%. Steps of 5',
    );
  });

  it('keeps aria-invalid and aria-valuetext to itself', () => {
    // @ts-expect-error: a caller's aria-invalid would be overwritten; pass `error`
    const invalid = <Slider label="Invalid" aria-invalid />;
    // @ts-expect-error: a caller's aria-valuetext would be overwritten; pass `valueText`
    const valueText = <Slider label="Text" defaultValue={50} aria-valuetext="half" />;
    render(<>{invalid}{valueText}</>);
    expect(screen.getByRole('slider', { name: 'Invalid' })).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('slider', { name: 'Text' })).toHaveAttribute('aria-valuetext', '50');
  });

  it('passes native props and ref to the range, and className to the field', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(<Slider label="Share" name="share" data-key="s" className="x" ref={ref} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    expect(ref.current).toBe(slider);
    expect(slider).toHaveAttribute('name', 'share');
    expect(slider).toHaveAttribute('data-key', 's');
    expect(container.firstChild).toHaveClass('gt-field', 'gt-slider', 'x');
    expect(slider).not.toHaveClass('x');
  });

  it('disables both inputs and dims the row', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Slider label="Ashton Liu (you)" unit="%" withInput defaultValue={30} disabled onChange={onChange} helperText="Submitted · read only" />,
    );
    const slider = screen.getByRole('slider', { name: 'Ashton Liu (you)' });
    expect(slider).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Ashton Liu (you) exact value' })).toBeDisabled();
    expect(container.firstChild).toHaveClass('gt-slider--disabled', 'gt-field--disabled');
    await userEvent.click(slider);
    await userEvent.keyboard('{PageUp}');
    expect(onChange).not.toHaveBeenCalled();

    const [row] = cssRules('.gt-slider--disabled .gt-slider__row');
    expect(row.getPropertyValue('opacity')).toBe('var(--gt-opacity-disabled)');
  });

  it('falls back to min for a value that is not a number', () => {
    render(<Slider label="Share" min={10} value={Number.NaN} />);
    const slider = screen.getByRole('slider', { name: 'Share' });
    expect(slider).toHaveValue('10');
    expect(slider).toHaveAttribute('aria-valuetext', '10');
  });

  it('sets the fill from the value, and its colour and the thumb\'s from color', () => {
    const { container, rerender } = render(<Slider label="Tony Wu" min={10} max={20} defaultValue={15} color="var(--gt-avatar-2)" />);
    const control = container.querySelector<HTMLElement>('.gt-slider__control');
    expect(control?.style.getPropertyValue('--gt-slider-frac')).toBe('0.5');
    expect(control?.style.getPropertyValue('--gt-slider-accent')).toBe('var(--gt-avatar-2)');

    rerender(<Slider label="Tony Wu" min={10} max={20} defaultValue={15} />);
    expect(control?.style.getPropertyValue('--gt-slider-accent')).toBe('');

    const [fill] = cssRules('.gt-slider__fill');
    expect(fill.getPropertyValue('background')).toBe('var(--gt-slider-accent, var(--gt-primary))');
    const [webkitThumb] = cssRules('.gt-slider__input::-webkit-slider-thumb');
    expect(webkitThumb.getPropertyValue('background')).toBe('var(--gt-slider-accent, var(--gt-primary))');
    const [mozThumb] = cssRules('.gt-slider__input::-moz-range-thumb');
    expect(mozThumb.getPropertyValue('background')).toBe('var(--gt-slider-accent, var(--gt-primary))');
    const [track] = cssRules('.gt-slider__track');
    expect(track.getPropertyValue('background')).toBe('var(--gt-border-control)');
  });

  it('leaves the fill empty when the range has no width', () => {
    const { container } = render(<Slider label="Share" min={5} max={5} />);
    expect(container.querySelector<HTMLElement>('.gt-slider__control')?.style.getPropertyValue('--gt-slider-frac')).toBe('0');
  });

  it('rings the thumb on keyboard focus, not the range around it', () => {
    render(<Slider label="Share" />);
    const [box] = cssRules('.gt-slider__input:focus-visible');
    expect(box.getPropertyValue('box-shadow')).toBe('none');
    const [webkitThumb] = cssRules('.gt-slider__input:focus-visible::-webkit-slider-thumb');
    expect(webkitThumb.getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
    const [mozThumb] = cssRules('.gt-slider__input:focus-visible::-moz-range-thumb');
    expect(mozThumb.getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
  });

  it('is 44px tall on phones, its number input too', () => {
    render(<Slider label="Share" withInput />);
    const [control] = cssRules('.gt-slider__control', 'max-width: 767px');
    expect(control.getPropertyValue('height')).toBe('44px');
    const [webkitTrack] = cssRules('.gt-slider__input::-webkit-slider-runnable-track', 'max-width: 767px');
    expect(webkitTrack.getPropertyValue('height')).toBe('44px');
    const [mozTrack] = cssRules('.gt-slider__input::-moz-range-track', 'max-width: 767px');
    expect(mozTrack.getPropertyValue('height')).toBe('44px');
    const [webkitThumb] = cssRules('.gt-slider__input::-webkit-slider-thumb', 'max-width: 767px');
    expect(webkitThumb.getPropertyValue('margin-top')).toBe('12px');
    // Input's stylesheet comes with the Slider, phone rule included.
    const [input] = cssRules('.gt-input', 'max-width: 767px');
    expect(input.getPropertyValue('min-height')).toBe('44px');
  });

  it('holds the thumb still under reduced motion', () => {
    render(<Slider label="Share" />);
    const [webkitThumb] = cssRules('.gt-slider__input::-webkit-slider-thumb', 'prefers-reduced-motion');
    expect(webkitThumb.getPropertyValue('transition')).toBe('none');
    const [mozThumb] = cssRules('.gt-slider__input::-moz-range-thumb', 'prefers-reduced-motion');
    expect(mozThumb.getPropertyValue('transition')).toBe('none');
  });
});
