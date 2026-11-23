import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Textarea } from './Textarea';

export const meta: PreviewMeta = { group: 'Primitives', height: 480 };

const LIMIT = 120;

export default function TextareaPreview() {
  const [went, setWent] = useState('We shipped the dock map and the sign-in flow.');
  const [note, setNote] = useState(
    'The standup moved to Thursdays, and the board now has a column for review. We also agreed to pair on the payments work next sprint.',
  );
  return (
    <div className="ds-stack">
      <Textarea label="What went well?" value={went} onChange={(e) => setWent(e.target.value)} maxLength={500} />
      <Textarea
        label="Note"
        optional
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={LIMIT}
        error={note.length > LIMIT ? `Shorten this by ${note.length - LIMIT} characters.` : undefined}
      />
      <Textarea label="Feedback from your TA" defaultValue="Clear goals for the sprint." rows={2} disabled />
    </div>
  );
}
