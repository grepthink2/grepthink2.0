import React from 'react';
import { InfoPopover } from '../display/InfoPopover.jsx';

/**
 * "How this is counted" — analytics' name for the shared InfoPopover (promoted to
 * components/display/InfoPopover.jsx in the alignment round, 2026-10-19). Same props.
 */
export function DefinitionPopover({ title = 'How this is counted', className = '', ...props }) {
  return <InfoPopover title={title} className={['gt-definition', className].filter(Boolean).join(' ')} {...props} />;
}
