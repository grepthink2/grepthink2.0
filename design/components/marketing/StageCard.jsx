import React from 'react';

/**
 * Floating-card shell for spotlight-band stages: white, 20px radius,
 * two-layer shadow, a tilt (−3°…+3°) and a slow float (8–10s). Position
 * it with `style` inside a <Stage>. `order` drives the reveal stagger
 * (80ms apart). `pill` = pill-shaped chip shell. `mobile` marks the one
 * card that survives below 768px (untilted, still).
 */
export function StageCard({
  tilt = 0,
  floatY = -9,
  floatDur = 9,
  floatDelay = 0,
  order = 0,
  pill = false,
  still = false,
  inline = false,
  mobile = false,
  tabletHide = false,
  title,
  meta,
  children,
  style,
  className = '',
}) {
  const vars = { '--tilt': `${tilt}deg`, '--float-y': `${floatY}px`, '--float-dur': `${floatDur}s`, '--float-delay': `${floatDelay}s`, '--i': order, ...style };
  return (
    <div
      className={['gt-stage-card', pill ? 'gt-stage-card--pill' : '', still ? 'gt-stage-card--still' : '', inline ? 'gt-stage-card--inline' : '', mobile ? 'gt-stage-card--mobile' : '', tabletHide ? 'gt-stage-card--tablet-hide' : '', className].filter(Boolean).join(' ')}
      style={vars}
    >
      {(title || meta) && (
        <div className="gt-stage-card__head">
          {title && <span className="gt-stage-card__title">{title}</span>}
          {meta && <span className="gt-stage-card__meta">{meta}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Stage backdrop for a band: green-tinted with a masked dot grid for live
 * features, or the outlined flat "preview" for coming-soon ones (adds a
 * PREVIEW tag). Children are StageCards. Always aria-hidden — the band
 * text is the real content.
 */
export function Stage({ variant = 'live', mirror = false, paused = false, tag = 'PREVIEW', children, className = '', style }) {
  return (
    <div
      className={['gt-stage', variant === 'preview' ? 'gt-stage--preview' : '', mirror ? 'gt-stage--mirror' : '', paused ? 'gt-stage--paused' : '', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={style}
    >
      {variant === 'preview' && <span className="gt-stage__tag">{tag}</span>}
      {children}
    </div>
  );
}
