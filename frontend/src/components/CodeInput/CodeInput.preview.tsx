import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { CodeInput } from './CodeInput';

export const meta: PreviewMeta = { group: 'Primitives', height: 350 };

const join = () => {};
const verify = () => {};

export default function CodeInputPreview() {
  const [code, setCode] = useState('GRP4');
  const [otp, setOtp] = useState('482910');
  return (
    <div className="ds-stack">
      <CodeInput label="Class code" length={8} groupSize={4} value={code} onChange={setCode} onComplete={join} />
      <CodeInput
        label="Verification code"
        length={6}
        numeric
        value={otp}
        onChange={setOtp}
        onComplete={verify}
        error="That code has expired. We sent you a new one."
      />
      <CodeInput label="Class code" length={8} groupSize={4} helperText="Ask your instructor for it." disabled />
    </div>
  );
}
