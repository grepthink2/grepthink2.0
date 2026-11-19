import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { InlineConfirm } from '@/components/ConfirmDialog/ConfirmDialog';
import { DatePickerField } from '@/components/DatePickerField/DatePickerField';
import { Modal } from '@/components/Modal/Modal';
import { api, type ApiAssignment } from '@/lib/api';
import { pickerTextToIso, toPickerText } from '@/lib/dateUtils';
import './LateWindowModal.scss';

export interface LateWindowModalProps {
  open: boolean;
  /** The TSR assignment whose late window this sets. */
  assignment: ApiAssignment;
  onClose: () => void;
  /** The assignment as the server answered it, after a save or a removal. */
  onSaved: (updated: ApiAssignment) => void;
}

/** A window that ends more than this long after the deadline is let through, with a warning. */
const LONG_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** An ISO time as milliseconds; null for none. */
const toMs = (iso: string | null | undefined): number | null => (iso ? new Date(iso).getTime() : null);

/**
 * Sets, moves or removes an assignment's late window (`accept_until`, PUT /api/assignments/{id}/late-window)
 * for a TA who may, from TA Review. The time is picked on the viewer's clock and must be after the
 * deadline; past 14 days after it a warning shows, which does not block. Removing it asks first, in
 * place. On success the page gets the server's row through `onSaved`, and the dialog closes.
 */
export default function LateWindowModal({ open, assignment, onClose, onSaved }: LateWindowModalProps) {
  const [text, setText] = useState(() => toPickerText(assignment.accept_until));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const removeRef = useRef<HTMLButtonElement>(null);
  /** Set by the confirm's Cancel: focus goes back to "Remove late window" once that is shown again. */
  const removeCancelled = useRef(false);

  // Each open starts from the assignment's window as it stands. The dialog stays mounted between
  // opens (lazyModal), so this is adjusted while rendering the change rather than in an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText(toPickerText(assignment.accept_until));
      setError(null);
      setConfirmingRemove(false);
    }
  }

  // The confirm's Cancel unmounts with it, and focus would fall to the dialog: it goes back to the
  // button that asked.
  useEffect(() => {
    if (confirmingRemove || !removeCancelled.current) return;
    removeCancelled.current = false;
    removeRef.current?.focus();
  }, [confirmingRemove]);

  const busy = saving || removing;
  const dueMs = toMs(assignment.due_at);
  const chosen = pickerTextToIso(text);
  const chosenMs = toMs(chosen);
  const longWindow = dueMs !== null && chosenMs !== null && chosenMs > dueMs + LONG_WINDOW_MS;

  const save = async () => {
    // Checked here as the server checks it, so a time that cannot be is never sent. With no
    // deadline there is nothing to compare: the server says so.
    if (chosen === null || chosenMs === null || (dueMs !== null && chosenMs <= dueMs)) {
      setError('Choose a time after the deadline');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      onSaved(await api.setAssignmentLateWindow(assignment.id, chosen));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the late window');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError(null);
    setRemoving(true);
    try {
      onSaved(await api.setAssignmentLateWindow(assignment.id, null));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the late window');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Accept late submissions"
      subtitle={assignment.Title}
      closeDisabled={busy}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          {/* Not while the removal waits for its confirm: one change at a time. */}
          <Button
            onClick={() => void save()}
            disabled={removing || confirmingRemove}
            loading={saving}
            loadingLabel="Saving…"
          >
            Save
          </Button>
        </>
      }
    >
      <div className="late-window-modal">
        <DatePickerField
          label="Accept late submissions until"
          value={text}
          onChange={(value) => {
            setText(value);
            setError(null);
          }}
          showTime
          disabled={busy}
          disabledBefore={assignment.due_at ? new Date(assignment.due_at) : undefined}
        />
        {longWindow && <Alert tone="warning">More than 14 days after the deadline</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {assignment.accept_until &&
          (confirmingRemove ? (
            <InlineConfirm
              message="Remove the late window? Submissions close at the deadline again; anything already submitted stays."
              confirmLabel="Remove late window"
              busyLabel="Removing…"
              busy={removing}
              onConfirm={() => void remove()}
              onCancel={() => {
                removeCancelled.current = true;
                setConfirmingRemove(false);
              }}
            />
          ) : (
            <Button
              ref={removeRef}
              variant="danger-ghost"
              size="sm"
              className="late-window-modal__remove"
              onClick={() => setConfirmingRemove(true)}
              disabled={saving}
            >
              Remove late window
            </Button>
          ))}
      </div>
    </Modal>
  );
}
