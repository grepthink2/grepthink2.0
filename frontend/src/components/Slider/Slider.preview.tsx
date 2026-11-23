import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Slider } from './Slider';

export const meta: PreviewMeta = { group: 'Primitives', height: 320 };

export default function SliderPreview() {
  const [mine, setMine] = useState(40);
  const [leo, setLeo] = useState(35);
  const [ines, setInes] = useState(15);
  return (
    <div className="ds-stack">
      <Slider label="Maya Chen (you)" unit="%" value={mine} onChange={setMine} />
      <Slider label="Leo Park" unit="%" withInput color="var(--gt-avatar-2)" value={leo} onChange={setLeo} />
      <Slider
        label="Ines Ruiz"
        unit="%"
        value={ines}
        onChange={setInes}
        error="Contributions add up to 90%. Assign the last 10%."
      />
      <Slider label="Confidence" min={1} max={5} defaultValue={3} disabled />
    </div>
  );
}
