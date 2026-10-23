import React from 'react';
import { FieldShell } from './FieldShell.jsx';
import { Button } from './Button.jsx';
import { IconButton } from './IconButton.jsx';

const Glyph = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const UploadGlyph = (p) => <Glyph {...p} d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>} />;
const ImageGlyph = (p) => <Glyph {...p} d={<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /></>} />;
const FileGlyph = (p) => <Glyph {...p} d={<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M8 13h8M8 17h8" /></>} />;
const XGlyph = () => <Glyph size={14} d={<path d="M18 6 6 18M6 6l12 12" />} />;

export const formatFileSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const accepts = (f, accept) => !accept || accept.split(',').map((s) => s.trim().toLowerCase()).some((a) => (
  a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? (f.type || '').startsWith(a.slice(0, -1)) : f.type === a));

/**
 * File picker in two forms. `variant="image"`: a 72px preview (circle for avatars, `shape="square"`
 * for project logos) with Upload / Change and Remove. `variant="drop"`: a dashed drop area with a
 * Choose file button (roster CSV import); once chosen, a file row with Replace and Remove.
 * Type and size are checked before `onSelect`; failures show as the field error.
 */
export function FileUpload({
  id, variant = 'drop', label, hideLabel = false, helperText, error, optional = false,
  accept, maxSize, typeHint, disabled = false, file = null, fileMeta, previewUrl, shape = 'circle',
  onSelect, onRemove, chooseLabel, dropTitle = 'Drag a file here', className = '',
}) {
  const inputRef = React.useRef(null);
  const [over, setOver] = React.useState(false);
  const [localError, setLocalError] = React.useState('');
  const [live, setLive] = React.useState('');
  const take = (f) => {
    if (!f) return;
    const err = !accepts(f, accept) ? `Choose ${typeHint || 'a supported file type'}.`
      : maxSize && f.size > maxSize ? `That file is ${formatFileSize(f.size)}. The limit is ${formatFileSize(maxSize)}.` : '';
    setLocalError(err);
    if (!err) { setLive(`${f.name} selected`); if (onSelect) onSelect(f); }
  };
  const pickFile = () => { if (disabled || !inputRef.current) return; inputRef.current.value = ''; inputRef.current.click(); };
  const hidden = (
    <input ref={inputRef} type="file" accept={accept} className="gt-visually-hidden" tabIndex={-1} aria-hidden="true"
      onChange={(e) => take(e.target.files && e.target.files[0])} />
  );

  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} optional={optional} helperText={helperText}
      error={error || localError || undefined} disabled={disabled} group className={className}>
      {({ labelId, describedBy }) => (variant === 'image' ? (
        <div className="gt-upload-image" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
          <span className={['gt-upload-image__preview', shape === 'square' ? 'gt-upload-image__preview--square' : ''].filter(Boolean).join(' ')}>
            {previewUrl ? <img src={previewUrl} alt="" /> : <ImageGlyph size={24} />}
          </span>
          <div className="gt-upload-image__body">
            <div className="gt-upload-image__actions">
              <Button variant="outline" size="sm" iconLeft={<UploadGlyph size={14} />} onClick={pickFile} disabled={disabled}>
                {previewUrl ? 'Change' : (chooseLabel || 'Upload image')}
              </Button>
              {previewUrl && onRemove && <Button variant="danger-ghost" size="sm" onClick={onRemove} disabled={disabled}>Remove</Button>}
            </div>
          </div>
          {hidden}
          <span className="gt-visually-hidden" aria-live="polite">{live}</span>
        </div>
      ) : (
        <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
          {file ? (
            <div className="gt-upload-file">
              <span className="gt-upload-file__icon"><FileGlyph /></span>
              <span className="gt-upload-file__text">
                <span className="gt-upload-file__name">{file.name}</span>
                <span className="gt-upload-file__meta">{file.size != null ? formatFileSize(file.size) : ''}{fileMeta ? ` · ${fileMeta}` : ''}</span>
              </span>
              <span className="gt-upload-file__actions">
                <Button variant="outline" size="sm" onClick={pickFile} disabled={disabled}>Replace</Button>
                {onRemove && <IconButton variant="danger" size="sm" ariaLabel={`Remove ${file.name}`} onClick={onRemove} disabled={disabled}><XGlyph /></IconButton>}
              </span>
            </div>
          ) : (
            <div
              className={['gt-upload-drop', over ? 'gt-upload-drop--over' : '', disabled ? 'gt-upload-drop--disabled' : ''].filter(Boolean).join(' ')}
              onDragEnter={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
              onDragOver={(e) => { e.preventDefault(); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
              onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files && e.dataTransfer.files[0]); }}
            >
              <span className="gt-upload-drop__icon"><UploadGlyph /></span>
              <p className="gt-upload-drop__title">{dropTitle}</p>
              <p className="gt-upload-drop__hint">or</p>
              <Button variant="outline" size="sm" onClick={pickFile} disabled={disabled}>{chooseLabel || 'Choose file'}</Button>
            </div>
          )}
          {hidden}
          <span className="gt-visually-hidden" aria-live="polite">{live}</span>
        </div>
      ))}
    </FieldShell>
  );
}
