import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Button } from '@components/Button/Button';
import { IconButton } from '@components/IconButton/IconButton';
import { Input } from '@components/Input/Input';
import { CRITERIA_MAX, CRITERION_MAX } from '../utils/criteria';
import './CriteriaEditor.scss';

interface Props {
  /** The rows as typed, blank ones included: `cleanCriteria` (utils/criteria.ts) makes them the list saved. */
  value: string[];
  /** The next rows. Focus moves to a row the parent then draws, so it sets them at once. */
  onChange: (rows: string[]) => void;
  /** Focus the first row when the editor opens. */
  autoFocus?: boolean;
}

/** Where focus goes once the rows are drawn again: a row's text or one of its moves, or Add. */
type FocusTarget = { row: number; part: 'text' | 'up' | 'down' } | 'add';

/** A row's length as a story saves it: trimmed, as `criteriaFit` and the API count it. */
const savedLength = (row: string) => row.trim().length;

/**
 * A story's acceptance criteria as an ordered list of short statements: add one (the button, or Enter
 * in the last one), edit it in place, move it up or down, remove it. A row is trimmed when it loses
 * focus, and everything here counts the trimmed text, as `criteriaFit` (which gates a form's Save) and
 * the API do: a row past 300 characters is flagged on the kit Input (its error line, invalid) and
 * kept, never cut, with its count shown from 240; at 20 criteria Add is off and a hint, in a polite
 * live region, says why. Blank rows count for nothing: a form drops them.
 *
 * Rows are keyed by position: a move swaps two rows' text. Focus follows the moved criterion to its
 * new row, or takes the row's other move when this one reached an end and is disabled; after a remove
 * it goes to the criterion that took the row's place, else to Add.
 */
export default function CriteriaEditor({ value, onChange, autoFocus = false }: Props) {
  const labelId = useId();
  const hintId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const filled = value.filter((row) => row.trim()).length;
  const atLimit = filled >= CRITERIA_MAX;
  const hint = !atLimit
    ? ''
    : filled > CRITERIA_MAX
      ? `${filled} of ${CRITERIA_MAX}: remove one to save`
      : `${CRITERIA_MAX} of ${CRITERIA_MAX}: a story holds no more`;

  // After every draw: hand focus to where the last change asked for it, if anywhere.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === 'add') {
      addRef.current?.focus();
      return;
    }
    const row = listRef.current?.children[target.row];
    if (!row) return;
    if (target.part === 'text') {
      row.querySelector('input')?.focus();
      return;
    }
    const moves = [...row.querySelectorAll<HTMLButtonElement>('button[data-move]')];
    const next = moves.find((b) => b.dataset.move === target.part && !b.disabled) ?? moves.find((b) => !b.disabled);
    next?.focus();
  });

  const change = (rows: string[], focus: FocusTarget) => {
    pendingFocus.current = focus;
    onChange(rows);
  };
  const add = () => {
    if (!atLimit) change([...value, ''], { row: value.length, part: 'text' });
  };
  const remove = (i: number) => {
    const rows = value.filter((_, j) => j !== i);
    change(rows, rows.length > 0 ? { row: Math.min(i, rows.length - 1), part: 'text' } : 'add');
  };
  const move = (i: number, part: 'up' | 'down') => {
    const to = part === 'up' ? i - 1 : i + 1;
    if (to < 0 || to >= value.length) return;
    const rows = [...value];
    [rows[i], rows[to]] = [rows[to], rows[i]];
    change(rows, { row: to, part });
  };
  /** Enter in the last row starts the next one, unless that row is still blank or the list is full. */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (i !== value.length - 1 || !value[i].trim() || atLimit) return;
    e.preventDefault();
    add();
  };
  /** The row as a story saves it, once the cursor leaves it. */
  const trim = (i: number) => {
    if (value[i] !== value[i].trim()) onChange(value.map((row, j) => (j === i ? row.trim() : row)));
  };
  /** The row's count, from 80% of the limit: a help line, or past the limit its error. */
  const countOf = (row: string) => {
    const length = savedLength(row);
    const count = `${length} of ${CRITERION_MAX} characters`;
    if (length > CRITERION_MAX) return { error: count };
    return length >= CRITERION_MAX * 0.8 ? { helperText: count } : {};
  };

  return (
    <div className="criteria-editor" role="group" aria-labelledby={labelId}>
      <span className="criteria-editor__label" id={labelId}>Acceptance criteria</span>
      {value.length > 0 && (
        <ol className="criteria-editor__list" ref={listRef}>
          {value.map((text, i) => (
            // Keyed by its index on purpose: a row is a place in the list (see above).
            <li key={i} className="criteria-editor__row">
              <Input
                className="criteria-editor__field"
                label={`Criterion ${i + 1}`}
                hideLabel
                compact
                value={text}
                {...countOf(text)}
                placeholder={i === 0 ? 'The user can…' : undefined}
                autoFocus={autoFocus && i === 0}
                onChange={(e) => onChange(value.map((row, j) => (j === i ? e.target.value : row)))}
                onBlur={() => trim(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
              <span className="criteria-editor__moves">
                <IconButton
                  size="sm"
                  ariaLabel={`Move criterion ${i + 1} up`}
                  tooltip="Move up"
                  data-move="up"
                  disabled={i === 0}
                  onClick={() => move(i, 'up')}
                >
                  <ChevronUp size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  ariaLabel={`Move criterion ${i + 1} down`}
                  tooltip="Move down"
                  data-move="down"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, 'down')}
                >
                  <ChevronDown size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  ariaLabel={`Remove criterion ${i + 1}`}
                  tooltip="Remove"
                  onClick={() => remove(i)}
                >
                  <X size={14} />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="criteria-editor__foot">
        <Button
          ref={addRef}
          variant="ghost"
          size="sm"
          iconLeft={<Plus size={14} />}
          disabled={atLimit}
          aria-describedby={atLimit ? hintId : undefined}
          onClick={add}
        >
          Add criterion
        </Button>
        {/* Always in place, so its text is spoken when the list fills. */}
        <span className="criteria-editor__hint" id={hintId} aria-live="polite">{hint}</span>
      </div>
    </div>
  );
}
