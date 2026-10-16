import {
  useCallback, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type Ref,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Menu, MenuItem } from '@/components/Menu/Menu';
import { Popover } from '@/components/Popover/Popover';
import type { ApiScrumBoardSprint } from '@/lib/api';
import { percentDone, sprintDates } from '../utils/sprints';
import SprintStatusPill from './SprintStatusPill';
import './SprintPicker.scss';

interface SprintPickerProps {
  /** In starts_at order, as the API returns them. */
  sprints: ApiScrumBoardSprint[];
  selectedId: string | null;
  /** Called for a sprint other than the selected one. */
  onSelect: (sprintId: string) => void;
  /** The trigger button. React 19.2 passes `ref` as an ordinary prop — the first function component in
   *  this codebase to take one, so no precedent to copy; no `forwardRef`. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The scrum board's sprint switcher: a menu button whose rows show each sprint's dates, status and
 * live progress (tasks done, and points when the sprint has any). It opens on a click, Enter, Space,
 * ArrowDown or ArrowUp, on the selected sprint; Esc, a pick or the selected row close it with focus
 * back on the trigger, and Tab out of the menu closes it.
 * Spec: docs/superpowers/specs/2026-10-16-scrum-sprint-picker-design.md.
 */
export default function SprintPicker({ sprints, selectedId, onSelect, ref }: SprintPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // The trigger is ours (close hands focus back to it) and the page's (it refocuses it after a switch).
  const setTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  // Every way out but Tab comes through here. Stable, so Popover does not re-attach its listeners.
  const close = useCallback(() => {
    // Keyboard users were inside the menu, so hand focus back to the trigger first — the row would be
    // unmounted under it. After a click outside, the browser then moves focus to what was clicked.
    if (document.activeElement?.closest('.sprint-picker__menu')) triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }, []);

  const choose = (id: string) => {
    close();
    if (id !== selectedId) onSelect(id);
  };

  const onMenuBlur = (e: FocusEvent<HTMLDivElement>) => {
    // Tab / Shift+Tab out of the menu closes it (menu-button pattern); focus is already elsewhere,
    // the trigger included (Shift+Tab from the first row). Focus moving to nothing is no way out:
    // Safari, and Firefox on macOS, blur the focused row that way when a row is pressed, and closing
    // then would unmount the row before its click.
    const next = e.relatedTarget as Node | null;
    if (next && !e.currentTarget.contains(next)) setOpen(false);
  };

  // While the menu is open, pressing the trigger leaves focus on the row (Chrome would move it to the
  // trigger, closing the menu on the blur), and the click closes the menu.
  const onTriggerMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    if (open) e.preventDefault();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    // Enter and Space are the button's own click.
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    setOpen(true);
  };

  const selected = sprints.find((s) => s.id === selectedId) ?? null;
  const name = selected?.name ?? 'Sprint';

  const trigger = (
    <button
      ref={setTrigger}
      type="button"
      className="sprint-picker__trigger"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Sprint: ${name}`}
      title={name}
      onMouseDown={onTriggerMouseDown}
      onClick={() => (open ? close() : setOpen(true))}
      onKeyDown={onTriggerKeyDown}
    >
      <span className="sprint-picker__trigger-name">{name}</span>
      <ChevronDown size={14} aria-hidden="true" className="sprint-picker__chevron" />
    </button>
  );

  return (
    <span className="sprint-picker">
      <Popover open={open} onClose={close} anchor={trigger} placement="bottom" align="end" padded={false}>
        <Menu
          ariaLabel="Sprints"
          autoFocus="checked"
          onClose={close}
          onBlur={onMenuBlur}
          className="sprint-picker__menu"
        >
          {sprints.map((s) => {
            const p = s.progress;
            const percent = percentDone(p.tasks_done, p.tasks_total);
            // The story card's vocabulary ("1/2 tasks · 3/8 pts"): points only when the sprint has any.
            const points = p.points_total > 0 ? ` · ${p.points_done}/${p.points_total} pts` : '';
            const summary = p.tasks_total === 0 ? 'No tasks yet' : `${p.tasks_done}/${p.tasks_total} tasks${points}`;
            return (
              <MenuItem
                key={s.id}
                radio
                checked={s.id === selectedId}
                className="sprint-picker__item"
                icon={<Check size={14} aria-hidden="true" />}
                onSelect={() => choose(s.id)}
              >
                <span className="sprint-picker__head">
                  <span className="sprint-picker__name">{s.name}</span>
                  <SprintStatusPill status={s.status} />
                </span>
                <span className="sprint-picker__meta">{sprintDates(s)} · {summary}</span>
                {/* Spans only: the row is a <button>. The bar is decorative, as on the story card. */}
                <span className="sprint-picker__progress">
                  <span className="sprint-picker__bar" aria-hidden="true">
                    <span className="sprint-picker__bar-fill" style={{ width: `${percent}%` }} />
                  </span>
                  {p.tasks_total > 0 && <span className="sprint-picker__pct">{percent}%</span>}
                </span>
              </MenuItem>
            );
          })}
        </Menu>
      </Popover>
    </span>
  );
}
