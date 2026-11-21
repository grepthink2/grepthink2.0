import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { PasswordField } from './PasswordField';

export const meta: PreviewMeta = { group: 'Primitives', height: 230 };

export default function PasswordFieldPreview() {
  const [password, setPassword] = useState('correct horse');
  return (
    <div className="ds-grid">
      <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} />
      <PasswordField label="New password" autoComplete="new-password" helperText="At least 8 characters." />
      <PasswordField defaultValue="short" error="Use at least 8 characters." />
    </div>
  );
}
