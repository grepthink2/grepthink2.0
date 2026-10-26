import { useRef, useState } from 'react';
import { Button } from '@/components/Button/Button';
import { DatePickerField } from '@/components/DatePickerField/DatePickerField';
import { Input } from '@/components/Input/Input';
import { Modal } from '@/components/Modal/Modal';
import './SprintEditorModal.scss';

/** What creating a sprint sends: dates are 'yyyy-MM-dd', on the team's calendar. */
export interface SprintDraft {
  name: string;
  starts_at: string;
  ends_at: string;
}

interface Props {
  /** The form's starting values; the page works them out when it opens the form. */
  defaults: SprintDraft;
  saving?: boolean;
  onClose: () => void;
  onCreate: (body: SprintDraft) => void;
}

/** The backend's limit on a sprint name (CreateSprintRequest). */
const NAME_MAX = 80;

/** 'yyyy-MM-dd' as a local date, for the date picker's bounds. */
function localDate(value: string): Date | undefined {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
}

/** A team member plans a new sprint: its name and the days it runs. It starts out planned. */
export default function SprintEditorModal({ defaults, saving = false, onClose, onCreate }: Props) {
  const [name, setName] = useState(defaults.name);
  const [startsAt, setStartsAt] = useState(defaults.starts_at);
  const [endsAt, setEndsAt] = useState(defaults.ends_at);
  const nameRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  // The dates are 'yyyy-MM-dd', so comparing the strings compares the days.
  const endsBeforeStart = startsAt !== '' && endsAt !== '' && endsAt < startsAt;
  const ready = trimmed !== '' && trimmed.length <= NAME_MAX && startsAt !== '' && endsAt !== '' && !endsBeforeStart;

  const submit = () => {
    if (!ready || saving) return;
    onCreate({ name: trimmed, starts_at: startsAt, ends_at: endsAt });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="New sprint"
      subtitle="Stories move onto the board once they are in a sprint."
      closeDisabled={saving}
      initialFocusRef={nameRef}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!ready} loading={saving} loadingLabel="Creating…">
            Create sprint
          </Button>
        </>
      }
    >
      <form
        className="sprint-editor"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <Input
          ref={nameRef}
          label="Name"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          error={trimmed === '' ? 'Give the sprint a name.' : undefined}
        />
        <DatePickerField label="Starts" value={startsAt} onChange={setStartsAt} required />
        <DatePickerField
          label="Ends"
          value={endsAt}
          onChange={setEndsAt}
          disabledBefore={localDate(startsAt)}
          required
          error={endsBeforeStart ? 'A sprint ends on or after the day it starts.' : undefined}
        />
      </form>
    </Modal>
  );
}
