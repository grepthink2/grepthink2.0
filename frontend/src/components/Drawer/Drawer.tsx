import { useId, useImperativeHandle, useRef, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from '@/components/IconButton/IconButton';
import { useDialog } from '@/components/Modal/useDialog';
import './Drawer.scss';

export interface DrawerProps extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'role' | 'children' | 'tabIndex'> {
  /** @default false */
  open?: boolean;
  /** Esc, the scrim and the × call it, for the topmost dialog only. */
  onClose?: () => void;
  /** The visible heading, which names the drawer. Never the HTML `title` attribute. */
  title?: ReactNode;
  /** The second line, which describes the drawer. */
  subtitle?: ReactNode;
  children?: ReactNode;
  /** The pinned action row: outline Cancel, primary Save. */
  footer?: ReactNode;
  /** 'right' for editors, 'left' for the phone navigation. @default 'right' */
  side?: 'right' | 'left';
  /** Width in px or any CSS length. @default 420 (from the stylesheet; full width on phones) */
  width?: number | string;
  /** Holds the drawer open while it saves: the × is disabled, and Esc and the scrim do nothing. @default false */
  closeDisabled?: boolean;
  /** Takes focus on open (otherwise `[data-autofocus]`, then the first field, then the sheet). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** The drawer's name when it has no visible title (the phone navigation: "Main menu"). */
  ariaLabel?: string;
  /** false renders it in place instead of in `<body>` (galleries, harness pages). @default true */
  portal?: boolean;
  /**
   * Set by the drawer itself: `aria-modal` always, `aria-labelledby` from `title` and `aria-label` from
   * `ariaLabel`. JSX takes any hyphenated prop a type leaves out, so they are declared `never`.
   */
  'aria-modal'?: never;
  'aria-labelledby'?: never;
  'aria-label'?: never;
  /** Reaches the sheet while it is mounted. */
  ref?: Ref<HTMLElement>;
}

/**
 * Side sheet with the Modal's behaviour, ported from design/components/feedback/Drawer.jsx: an
 * `<aside>` with `role="dialog"` and `aria-modal`, 420px from the right for an editor that wants the
 * page behind it in view (the assignment editor), or from the left for the phone navigation. A
 * header with the × ("Close") and a footer stay pinned with hairlines while the body scrolls. It
 * slides 24px in and fades over 0.2s, reversing on close, and only fades under reduced motion; full
 * width on phones. Everything else is useDialog's, as for Modal: the stack, focus in, trapped and
 * given back, Esc and the scrim for the topmost dialog only, the scroll lock, `closeDisabled`.
 *
 * Native props and `ref` reach the sheet. Codebase-side: a caller's `aria-describedby` follows the
 * subtitle in the description.
 */
export function Drawer({
  open = false, onClose, title, subtitle, children, footer, side = 'right', width, closeDisabled = false,
  initialFocusRef, ariaLabel, portal = true, className = '', style, 'aria-describedby': describedBy, ref, ...rest
}: DrawerProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const id = useId();
  const { mounted, closing, onScrimDown } = useDialog({
    open, onClose, closeDisabled, initialFocusRef, sheetRef, exitMs: 200, inPlace: !portal,
  });
  // The caller's ref follows the sheet, which mounts and unmounts with the drawer: set on every commit.
  useImperativeHandle(ref, () => sheetRef.current as HTMLElement);
  if (!mounted) return null;

  const titleId = `${id}-title`;
  const subtitleId = `${id}-subtitle`;
  const description = [subtitle ? subtitleId : '', describedBy ?? ''].filter(Boolean).join(' ');
  const left = side === 'left';
  const drawer = (
    <div
      className={[
        'gt-drawer-backdrop',
        left ? 'gt-drawer-backdrop--left' : '',
        closing ? 'gt-drawer-backdrop--closing' : '',
        portal ? '' : 'gt-drawer-backdrop--inline',
      ].filter(Boolean).join(' ')}
      onMouseDown={onScrimDown}
    >
      <aside
        {...rest}
        ref={sheetRef}
        className={['gt-drawer', left ? 'gt-drawer--left' : '', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        aria-describedby={description || undefined}
        tabIndex={-1}
        style={width ? { ...style, width } : style}
      >
        <div className="gt-drawer__head">
          {title && <h2 className="gt-drawer__title" id={titleId}>{title}</h2>}
          {subtitle && <p className="gt-drawer__subtitle" id={subtitleId}>{subtitle}</p>}
          <IconButton className="gt-drawer__close" ariaLabel="Close" tooltip={false} onClick={onClose} disabled={closeDisabled}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="gt-drawer__body">{children}</div>
        {footer && <div className="gt-drawer__footer">{footer}</div>}
      </aside>
    </div>
  );
  return portal ? createPortal(drawer, document.body) : drawer;
}
