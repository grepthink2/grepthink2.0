import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Link } from '../router-stub';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Link stand-in', () => {
  it('renders an anchor to a string destination, with the other props on it', () => {
    const { container } = render(<Link to="/a" className="x" aria-current="page">Go</Link>);
    const anchor = container.querySelector('a[href="/a"].x');
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute('aria-current', 'page');
    expect(anchor).toHaveTextContent('Go');
  });

  it('joins a path object into the href', () => {
    const { container } = render(<Link to={{ pathname: '/p', search: '?q=1', hash: '#h' }}>Go</Link>);
    expect(container.querySelector('a')).toHaveAttribute('href', '/p?q=1#h');
    const { container: partial } = render(<Link to={{ search: '?only' }}>Go</Link>);
    expect(partial.querySelector('a')).toHaveAttribute('href', '?only');
  });

  it('keeps the router-only props off the anchor', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <Link
        to="/a"
        reloadDocument
        replace
        state={{ from: 'x' }}
        preventScrollReset
        relative="path"
        viewTransition
        discover="none"
        prefetch="intent"
      >
        Go
      </Link>,
    );
    const anchor = container.querySelector('a');
    expect(anchor?.getAttributeNames().sort()).toEqual(['href']);
    expect(error).not.toHaveBeenCalled();
  });

  it('hands its ref to the anchor', () => {
    const ref = createRef<HTMLAnchorElement>();
    render(<Link to="/a" ref={ref}>Go</Link>);
    expect(ref.current?.tagName).toBe('A');
  });
});
