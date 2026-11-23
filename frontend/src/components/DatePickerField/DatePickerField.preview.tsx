import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { DatePickerField } from './DatePickerField';

export const meta: PreviewMeta = { group: 'Primitives', height: 500 };

const TERM_STARTS = new Date(2026, 8, 24);

export default function DatePickerFieldPreview() {
  const [due, setDue] = useState('2026-10-09');
  const [slot, setSlot] = useState('2026-10-09 15:00');
  const [opens, setOpens] = useState('');
  const [closes, setCloses] = useState('');
  return (
    <div className="ds-grid">
      <DatePickerField label="Due date" value={due} onChange={setDue} disabledBefore={TERM_STARTS} required />
      <DatePickerField label="Review slot" showTime value={slot} onChange={setSlot} helperText="In your time zone." />
      <DatePickerField label="Opens" optional value={opens} onChange={setOpens} />
      <DatePickerField label="Closes" value={closes} onChange={setCloses} error={closes ? undefined : 'Pick the day it closes.'} />
    </div>
  );
}
