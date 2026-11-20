import {
  Component,
  cloneElement,
  createRef,
  forwardRef,
  memo,
  useState,
  version,
  type Ref,
} from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { version as domVersion } from 'react-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { adapt, wrapExport } from '../adapt';

afterEach(() => {
  vi.restoreAllMocks();
});

const Box = ({ ref }: { ref?: Ref<HTMLDivElement> }) => <div ref={ref} data-testid="box" />;

describe('the ref adapter', () => {
  it('runs on React 18', () => {
    expect(version.startsWith('18.')).toBe(true);
    expect(domVersion.startsWith('18.')).toBe(true);
  });

  it('hands a ref prop to a function component', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Box ref={ref} />);
    expect(ref.current).toBe(screen.getByTestId('box'));
  });

  it('passes the ref through a component that forwards it as a prop', () => {
    const Inner = ({ ref }: { ref?: Ref<HTMLButtonElement> }) => <button ref={ref} />;
    const Outer = ({ ref }: { ref?: Ref<HTMLButtonElement> }) => <Inner ref={ref} />;
    const ref = createRef<HTMLButtonElement>();
    render(<Outer ref={ref} />);
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('supports a callback ref and calls it with null on unmount', () => {
    const ref = vi.fn();
    const { unmount } = render(<Box ref={ref} />);
    const box = screen.getByTestId('box');
    unmount();
    expect(ref.mock.calls).toEqual([[box], [null]]);
  });

  it('keeps state when a ref is added and removed at the same position', async () => {
    const Counter = ({ ref }: { ref?: Ref<HTMLButtonElement> }) => {
      const [count, setCount] = useState(0);
      return (
        <button ref={ref} type="button" onClick={() => setCount((n) => n + 1)}>
          {count}
        </button>
      );
    };
    const ref = createRef<HTMLButtonElement>();
    const { rerender } = render(<Counter />);
    await userEvent.click(screen.getByRole('button'));
    rerender(<Counter ref={ref} />);
    expect(screen.getByRole('button')).toHaveTextContent('1');
    expect(ref.current).toBe(screen.getByRole('button'));
    rerender(<Counter />);
    expect(screen.getByRole('button')).toHaveTextContent('1');
  });

  it('gives a component no ref key when none was passed', () => {
    const received: object[] = [];
    const Probe = (props: object) => {
      received.push(props);
      return null;
    };
    render(<Probe />);
    expect(received).toHaveLength(1);
    expect('ref' in received[0]).toBe(false);
  });

  it('returns one wrapper per component', () => {
    expect(adapt(Box)).toBe(adapt(Box));
    expect(adapt(Box)).not.toBe(Box);
  });

  it('leaves classes, memo and forwardRef components and host tags alone', () => {
    class Legacy extends Component {
      render() {
        return null;
      }
    }
    const Memoised = memo(() => null);
    const Forwarded = forwardRef<HTMLDivElement>((_props, ref) => <div ref={ref} />);
    expect(adapt(Legacy)).toBe(Legacy);
    expect(adapt(Memoised)).toBe(Memoised);
    expect(adapt(Forwarded)).toBe(Forwarded);
    expect(adapt('div')).toBe('div');
  });

  it('keeps a ref through cloneElement', () => {
    const ref = createRef<HTMLDivElement>();
    render(cloneElement(<Box />, { ref }));
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBe(screen.getByTestId('box'));
  });

  it('names the wrapper after the component', () => {
    expect((adapt(Box) as { displayName?: string }).displayName).toBe('Box');
    const Named = Object.assign(() => null, { displayName: 'Shown' });
    expect((adapt(Named) as { displayName?: string }).displayName).toBe('Shown');
  });

  it('keeps a key given to jsx', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Item = ({ label }: { label: string }) => <li>{label}</li>;
    const { rerender } = render(<ul>{['a', 'b'].map((label) => <Item key={label} label={label} />)}</ul>);
    const first = screen.getByText('a');
    rerender(<ul>{['b', 'a'].map((label) => <Item key={label} label={label} />)}</ul>);
    expect(screen.getByText('a')).toBe(first);
    expect(error).not.toHaveBeenCalled();
  });

  it('asks for keys in a list, not of static children', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const A = () => <span>a</span>;
    render(
      <div>
        <A />
        <span>b</span>
      </div>,
    );
    expect(error).not.toHaveBeenCalled();
    render(<ol>{['x', 'y'].map((label) => <li>{label}</li>)}</ol>);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('unique "key" prop');
  });

  it('keeps the component as the element type, with the ref in its props', () => {
    const ref = createRef<HTMLDivElement>();
    const element = <Box ref={ref} />;
    expect(element.type).toBe(Box);
    expect((element.props as { ref?: unknown }).ref).toBe(ref);
    expect(cloneElement(<Box />, { ref }).type).toBe(Box);
  });

  it('leaves a ref on a host element to React', () => {
    const ref = createRef<HTMLInputElement>();
    const element = <input ref={ref} />;
    expect((element as unknown as { ref: unknown }).ref).toBe(ref);
    render(element);
    expect(ref.current?.tagName).toBe('INPUT');
  });
});

describe('wrapExport', () => {
  it('adapts a component and keeps its static properties', () => {
    const Panel = Object.assign(({ ref }: { ref?: Ref<HTMLElement> }) => <section ref={ref} />, { group: 'Display' });
    const wrapped = wrapExport(Panel);
    expect(wrapped).toBe(adapt(Panel));
    expect(wrapped.group).toBe('Display');
  });

  it('passes anything that is not a function component through', () => {
    const map = { a: 1 };
    expect(wrapExport(map)).toBe(map);
    expect(wrapExport('x')).toBe('x');
  });
});
