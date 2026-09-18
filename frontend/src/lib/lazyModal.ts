import { createElement, lazy, Suspense, useState, type Attributes, type ComponentType, type FC } from 'react';

/**
 * A modal whose code loads the first time it opens, so heavy form pieces (the
 * date picker, for one) stay out of the initial bundle. After the first open it
 * stays mounted, so its close animation still plays.
 *
 *   const CreateClassModal = lazyModal(() => import('./CreateClassModal'), (p) => p.isOpen);
 */
export function lazyModal<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  isOpen: (props: P) => boolean,
): FC<P> {
  const Modal = lazy(load);
  const LazyModal: FC<P> = (props) => {
    const open = isOpen(props);
    const [hasOpened, setHasOpened] = useState(open);
    if (open && !hasOpened) setHasOpened(true);
    if (!hasOpened) return null;
    return createElement(Suspense, { fallback: null }, createElement(Modal as ComponentType<P>, props as Attributes & P));
  };
  return LazyModal;
}
