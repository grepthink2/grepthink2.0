import { useId, type ReactNode } from 'react';
import { LayoutGrid } from 'lucide-react';

interface FromBoardProps {
  /** The revision's sections are the snapshot taken when it was handed in, not the board now. */
  frozen: boolean;
  /** A line under the label: where the numbers come from ("As the sprint stood on Oct 18"). */
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * What the board supplies to a document, read only: a tinted block labelled "From the board", or
 * "From the board, as handed in" on a revision whose sections were frozen when it was finalized. The
 * label names the block as a group; the sections inside keep their own headings.
 */
export default function FromBoard({ frozen, note, className = '', children }: FromBoardProps) {
  const labelId = useId();
  return (
    <div className={['document-from-board', className].filter(Boolean).join(' ')} role="group" aria-labelledby={labelId}>
      <p className="document-from-board__label" id={labelId}>
        <LayoutGrid size={13} aria-hidden="true" />
        {frozen ? 'From the board, as handed in' : 'From the board'}
      </p>
      {note && <p className="document-from-board__note">{note}</p>}
      {children}
    </div>
  );
}
