import { useId, useImperativeHandle, useRef, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from '@/components/IconButton/IconButton';
import { useDialog } from './useDialog';
import './Modal.scss';

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'role' | 'children' | 'tabIndex'> {
  /** @default false */
  open?: boolean;
  /** Esc, the scrim and the × call it, for the topmost dialog only. */
  onClose?: () => void;
  /** The visible heading, which names the dialog. Never the HTML `title` attribute. */
  title?: ReactNode;
  /** The second line, which describes the dialog. */
  subtitle?: ReactNode;
  children?: ReactNode;
  /** The pinned action row, right-aligned: outline Cancel, then the primary action. */
  footer?: ReactNode;
  /** The form header's slot under the title: a tab strip (Edit Project). */
  tabs?: ReactNode;
  /** sm 400 (confirms, messages) · md 560 (forms) · lg 760 (Edit Project). @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Legacy max-width override, in px. */
  width?: number;
  /** 'form': title left at 18/600, tabs below, footer over a hairline. 'message': a centred 28px title. @default 'form' */
  variant?: 'form' | 'message';
  /** Holds the dialog open while it saves: the × is disabled, and Esc and the scrim do nothing. @default false */
  closeDisabled?: boolean;
  /** Takes focus on open (otherwise `[data-autofocus]`, then the first field, then the sheet). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** @default false */
  hideClose?: boolean;
  /** 'alertdialog' for confirmations (ConfirmDialog sets it). @default 'dialog' */
  role?: 'dialog' | 'alertdialog';
  /** false renders it in place instead of in `<body>` (galleries, harness pages). @default true */
  portal?: boolean;
  /** The dialog's name when it has no `title`. */
  ariaLabel?: string;
  /**
   * Set by the dialog itself: `aria-modal` always, `aria-labelledby` from `title` and `aria-label` from
   * `ariaLabel`. JSX takes any hyphenated prop a type leaves out, so they are declared `never`.
   */
  'aria-modal'?: never;
  'aria-labelledby'?: never;
  'aria-label'?: never;
  /** Reaches the sheet while it is mounted. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * The one dialog shell, ported from design/components/feedback/Modal.jsx: a sheet with
 * `role="dialog"` (or `alertdialog`) and `aria-modal`, labelled by its title and described by its
 * subtitle, over a blurred scrim, portaled to `<body>` at `--gt-z-modal`. The form header (the
 * default) puts the title left with optional tabs under it; the message header centres a 28px
 * title. The header and footer stay pinned while the body scrolls, up to 88vh. Sizes sm 400, md 560,
 * lg 760; `width` overrides the max width. Its behaviour is useDialog's: the dialog stack, focus moved
 * in, trapped and given back, Esc and the scrim for the topmost dialog only, the scroll lock, and a
 * 0.15s fade on close (none under reduced motion). The × is IconButton md, "Close", disabled with
 * `closeDisabled`.
 *
 * Native props and `ref` reach the sheet. Codebase-side: `ariaLabel` names a dialog with no title
 * (as Drawer's does), and a caller's `aria-describedby` follows the subtitle in the description.
 */
export function Modal({
  open = false, onClose, title, subtitle, children, footer, tabs, size = 'md', width, variant = 'form',
  closeDisabled = false, initialFocusRef, hideClose = false, role = 'dialog', portal = true, ariaLabel,
  className = '', style, 'aria-describedby': describedBy, ref, ...rest
}: ModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const { mounted, closing, onScrimDown } = useDialog({
    open, onClose, closeDisabled, initialFocusRef, sheetRef, inPlace: !portal,
  });
  // The caller's ref follows the sheet, which mounts and unmounts with the dialog: set on every commit.
  useImperativeHandle(ref, () => sheetRef.current as HTMLDivElement);
  if (!mounted) return null;

  const titleId = `${id}-title`;
  const subtitleId = `${id}-subtitle`;
  const description = [subtitle ? subtitleId : '', describedBy ?? ''].filter(Boolean).join(' ');
  const dialog = (
    <div
      className={[
        'gt-modal-backdrop',
        closing ? 'gt-modal-backdrop--closing' : '',
        portal ? '' : 'gt-modal-backdrop--inline',
      ].filter(Boolean).join(' ')}
      onMouseDown={onScrimDown}
    >
      <div
        {...rest}
        ref={sheetRef}
        className={['gt-modal', `gt-modal--${size}`, `gt-modal--${variant}`, className].filter(Boolean).join(' ')}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        aria-describedby={description || undefined}
        tabIndex={-1}
        style={width ? { ...style, maxWidth: width } : style}
      >
        <div className="gt-modal__head">
          {title && <h2 className="gt-modal__title" id={titleId}>{title}</h2>}
          {subtitle && <p className="gt-modal__subtitle" id={subtitleId}>{subtitle}</p>}
          {!hideClose && (
            <IconButton className="gt-modal__close" ariaLabel="Close" tooltip={false} onClick={() => onClose?.()} disabled={closeDisabled}>
              <X size={18} aria-hidden="true" />
            </IconButton>
          )}
          {tabs && <div className="gt-modal__tabs">{tabs}</div>}
        </div>
        <div className="gt-modal__body">{children}</div>
        {footer && <div className="gt-modal__footer">{footer}</div>}
      </div>
    </div>
  );
  return portal ? createPortal(dialog, document.body) : dialog;
}
