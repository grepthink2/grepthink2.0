import React from 'react';

/** Solutions feature column: 44px icon tile, title, description. */
export function FeatureColumn({ icon, title, children, className = '' }) {
  return (
    <div className={['gt-feature-col', className].filter(Boolean).join(' ')}>
      {icon && <span className="gt-feature-col__icon" aria-hidden="true">{icon}</span>}
      <h3 className="gt-feature-col__title">{title}</h3>
      <p className="gt-feature-col__desc">{children}</p>
    </div>
  );
}

/** Browser-chrome frame for the product screenshot (masked crop from the top). */
export function PreviewWindow({ src, alt = 'grepthink app preview', unmasked = false, className = '' }) {
  return (
    <div className="gt-preview-panel">
      <div className={['gt-preview-window', className].filter(Boolean).join(' ')}>
        <div className="gt-preview-window__chrome" aria-hidden="true"><span /><span /><span /></div>
        <div className={['gt-preview-window__body', unmasked ? 'gt-preview-window__body--unmasked' : ''].filter(Boolean).join(' ')}>
          <img src={src} alt={alt} className="gt-preview-window__img" />
        </div>
      </div>
    </div>
  );
}
