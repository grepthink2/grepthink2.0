/**
 * The ref adapter. The kit is written for React 19, where a function component receives `ref` as
 * a prop. React 18 takes `ref` out of an element's props and hands it only to `forwardRef`
 * components, so two things put it back:
 *
 * - Elements made inside the bundle (the JSX runtime, and `createElement` and `cloneElement` as
 *   runtime/react.ts exports them) carry a function component's ref in its props, as React 19's
 *   elements do (`withRefProp`). The element's type stays the component itself, so a library that
 *   compares element types (React Router's `Routes` looks for `Route`) still finds it, and a
 *   component keeps its state when a ref comes or goes.
 * - Components a page renders with its own React (the bundle's exports) go through a cached
 *   `forwardRef` wrapper that calls the component with the ref back in its props (`adapt`).
 *
 * Classes, host tags and React's own wrapper objects (`memo`, `forwardRef`, `lazy`, contexts,
 * `Fragment`) are left as they are.
 */
import { forwardRef, type ReactNode, type Ref } from 'react';

type FunctionComponent = ((props: object) => ReactNode) & { displayName?: string };

/** A plain function component: a function that is not a class component. */
export function isFunctionComponent(type: unknown): type is FunctionComponent {
  if (typeof type !== 'function') return false;
  const proto = (type as { prototype?: { isReactComponent?: unknown } }).prototype;
  return !proto?.isReactComponent;
}

/** The same element with `ref` in its props, and none on the element. */
export function withRefProp<E extends object>(element: E, ref: unknown): E {
  const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(element);
  const props = (element as { props: object }).props;
  descriptors.props = { ...descriptors.props, value: Object.freeze({ ...props, ref }) };
  return Object.create(Object.getPrototypeOf(element), descriptors) as E;
}

const wrappers = new WeakMap<FunctionComponent, unknown>();

/** A function component as a `forwardRef` component (one per component); anything else as it is. */
export function adapt<T>(type: T): T {
  if (!isFunctionComponent(type)) return type;
  let wrapper = wrappers.get(type);
  if (!wrapper) {
    const component = type;
    const forwarded = forwardRef((props: object, ref: Ref<unknown>) =>
      component(ref == null ? props : { ...props, ref }),
    );
    forwarded.displayName = component.displayName || component.name || undefined;
    wrapper = forwarded;
    wrappers.set(component, wrapper);
  }
  return wrapper as T;
}

/**
 * A bundle export as a page receives it: a component through `adapt`, with any static properties
 * it carries copied onto the wrapper; anything else unchanged.
 */
export function wrapExport<T>(value: T): T {
  const wrapped = adapt(value);
  if (wrapped === value) return value;
  for (const key of Object.keys(value as object)) {
    if (!(key in (wrapped as object))) {
      (wrapped as Record<string, unknown>)[key] = (value as Record<string, unknown>)[key];
    }
  }
  return wrapped;
}
