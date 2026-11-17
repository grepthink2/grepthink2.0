import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Button } from '@components/Button/Button';
import { IconButton } from '@components/IconButton/IconButton';

/** What a row or the foot hands focus to: its first link, button or field. */
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';

/** Ends an announcement that repeats the one before, so the live region's text changes and is spoken again. */
const NBSP = String.fromCharCode(0xa0);

/** Where focus goes once the list is drawn again: a row's first control, one of its moves, or the foot. */
type FocusTarget = { key: string; part: 'first' | 'up' | 'down' } | 'foot';

interface EditableListProps<T> {
  /** Names the list for a screen reader ("Stop doing"). */
  label: string;
  items: T[];
  itemKey: (item: T) => string;
  /** How the row's controls and the announcements name an item: "“Pair on reviews”", "US-3". */
  itemName: (item: T, index: number) => string;
  /** The row's content: its fields, or its text when the list is read only. */
  renderItem: (item: T, index: number) => ReactNode;
  editable: boolean;
  onChange?: (items: T[]) => void;
  /** The most the list holds: Add turns off there, and the hint says why. */
  max: number;
  /** Makes the item Add appends; without it there is no Add (a list a picker fills). */
  newItem?: () => T;
  addLabel?: string;
  /** Another way to add, beside Add in the list's foot (a story picker). */
  addControl?: ReactNode;
  /** What an empty list says. */
  emptyText: string;
  /** The hint at the limit. @default "{max} of {max}: the list holds no more" */
  limitText?: string;
}

/**
 * An ordered list a team edits in place: each row's own fields, then Move up, Move down and Remove
 * (keyboard-reachable; there is no drag), and Add in the foot. Focus follows a moved row, goes to the
 * row that took a removed one's place (else to the foot), and into a new row. A polite live region
 * says where a row went and what was removed. At `max` Add is off and its hint says so. Read only,
 * the rows show without controls.
 */
export default function EditableList<T>({
  label, items, itemKey, itemName, renderItem, editable, onChange, max, newItem, addLabel = 'Add', addControl,
  emptyText, limitText,
}: EditableListProps<T>) {
  const listRef = useRef<HTMLOListElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const [said, setSaid] = useState('');
  const hintId = useId();
  const atLimit = items.length >= max;

  // After every draw: hand focus to where the last change asked for it, if anywhere.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === 'foot') {
      footRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      return;
    }
    const row = [...(listRef.current?.children ?? [])]
      .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.itemKey === target.key);
    if (!row) return;
    if (target.part === 'first') {
      row.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      return;
    }
    const moves = [...row.querySelectorAll<HTMLButtonElement>('button[data-move]')];
    (moves.find((b) => b.dataset.move === target.part && !b.disabled) ?? moves.find((b) => !b.disabled))?.focus();
  });

  const change = (next: T[], focus: FocusTarget, announcement = '') => {
    pendingFocus.current = focus;
    // A second "known problem 1 removed" must differ from the first, or a screen reader stays quiet.
    setSaid((before) => (announcement && announcement === before ? `${announcement}${NBSP}` : announcement));
    onChange?.(next);
  };
  const move = (i: number, part: 'up' | 'down') => {
    const to = part === 'up' ? i - 1 : i + 1;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[i], next[to]] = [next[to], next[i]];
    change(next, { key: itemKey(items[i]), part }, `${itemName(items[i], to)} moved to ${to + 1} of ${items.length}`);
  };
  const remove = (i: number) => {
    const next = items.filter((_, j) => j !== i);
    const focus: FocusTarget = next.length ? { key: itemKey(next[Math.min(i, next.length - 1)]), part: 'first' } : 'foot';
    change(next, focus, `${itemName(items[i], i)} removed`);
  };
  const add = () => {
    if (!newItem || atLimit) return;
    const item = newItem();
    change([...items, item], { key: itemKey(item), part: 'first' });
  };

  return (
    <div className="document-list">
      {items.length === 0 ? (
        <p className="document-list__empty">{emptyText}</p>
      ) : (
        <ol className="document-list__items" ref={listRef} aria-label={label}>
          {items.map((item, i) => {
            const name = itemName(item, i);
            return (
              <li key={itemKey(item)} className="document-list__item" data-item-key={itemKey(item)}>
                <div className="document-list__body">{renderItem(item, i)}</div>
                {editable && (
                  <span className="document-list__controls">
                    <IconButton
                      size="sm"
                      ariaLabel={`Move ${name} up`}
                      tooltip="Move up"
                      data-move="up"
                      disabled={i === 0}
                      onClick={() => move(i, 'up')}
                    >
                      <ChevronUp size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      ariaLabel={`Move ${name} down`}
                      tooltip="Move down"
                      data-move="down"
                      disabled={i === items.length - 1}
                      onClick={() => move(i, 'down')}
                    >
                      <ChevronDown size={14} />
                    </IconButton>
                    <IconButton size="sm" ariaLabel={`Remove ${name}`} tooltip="Remove" onClick={() => remove(i)}>
                      <X size={14} />
                    </IconButton>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {editable && (
        <div className="document-list__foot" ref={footRef}>
          {newItem && (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Plus size={14} />}
              disabled={atLimit}
              aria-describedby={atLimit ? hintId : undefined}
              onClick={add}
            >
              {addLabel}
            </Button>
          )}
          {addControl}
          {/* Always in place, so its text is spoken when the list fills. */}
          <span className="document-list__hint" id={hintId} aria-live="polite">
            {atLimit ? (limitText ?? `${max} of ${max}: the list holds no more`) : ''}
          </span>
        </div>
      )}
      <p className="gt-visually-hidden" aria-live="polite" aria-atomic="true">{said}</p>
    </div>
  );
}
