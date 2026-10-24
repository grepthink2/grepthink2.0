import React from 'react';
import { FieldShell } from './FieldShell.jsx';
import { IconButton } from './IconButton.jsx';
import { Tabs, TabPanel } from '../navigation/Tabs.jsx';

const G = ({ d }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const TOOLS = [
  { id: 'bold', label: 'Bold', keys: 'b', icon: <G d={<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />} /> },
  { id: 'italic', label: 'Italic', keys: 'i', icon: <G d={<><path d="M19 4h-9M14 20H5M15 4 9 20" /></>} /> },
  { id: 'link', label: 'Link', keys: 'k', icon: <G d={<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>} /> },
  { id: 'list', label: 'Bulleted list', icon: <G d={<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>} /> },
  { id: 'code', label: 'Code', icon: <G d={<><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></>} /> },
];

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
function inline(text, key) {
  const out = []; let last = 0; let m; let k = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0]; const kk = `${key}-${k++}`;
    if (t.startsWith('**')) out.push(<strong key={kk}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={kk}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
      out.push(<a key={kk} href={/^(https?:|mailto:)/i.test(mm[2]) ? mm[2] : undefined} target="_blank" rel="noreferrer noopener">{mm[1]}</a>);
    } else out.push(<em key={kk}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Design-side preview: paragraphs, lists, bold, italic, code, links. The port renders MarkdownText (GFM). */
export function renderMarkdownLite(src = '') {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const blocks = []; let i = 0;
  const isUl = (l) => /^\s*[-*]\s+/.test(l); const isOl = (l) => /^\s*\d+\.\s+/.test(l);
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    if (isUl(lines[i]) || isOl(lines[i])) {
      const ordered = isOl(lines[i]); const items = [];
      while (i < lines.length && (ordered ? isOl(lines[i]) : isUl(lines[i]))) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; }
      const L = ordered ? 'ol' : 'ul';
      blocks.push(<L key={blocks.length}>{items.map((t, j) => <li key={j}>{inline(t, `${blocks.length}-${j}`)}</li>)}</L>);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !isUl(lines[i]) && !isOl(lines[i])) { para.push(lines[i]); i++; }
    const n = blocks.length;
    blocks.push(<p key={n}>{para.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(l, `${n}-${j}`)}</React.Fragment>)}</p>);
  }
  return blocks;
}

function edit(tool, value, s, e) {
  const sel = value.slice(s, e);
  const wrap = (a, b, ph) => { const t = sel || ph; return { next: value.slice(0, s) + a + t + b + value.slice(e), from: s + a.length, to: s + a.length + t.length }; };
  if (tool === 'bold') return wrap('**', '**', 'bold text');
  if (tool === 'italic') return wrap('_', '_', 'italic text');
  if (tool === 'code') return sel.includes('\n') ? wrap('```\n', '\n```', '') : wrap('`', '`', 'code');
  if (tool === 'link') {
    const t = sel || 'link text'; const url = 'https://';
    const before = `${value.slice(0, s)}[${t}](`;
    return { next: `${before}${url})${value.slice(e)}`, from: before.length, to: before.length + url.length };
  }
  const start = value.lastIndexOf('\n', s - 1) + 1;
  const block = (value.slice(start, e) || 'List item').split('\n').map((l) => (/^\s*[-*]\s/.test(l) ? l : `- ${l}`)).join('\n');
  return { next: value.slice(0, start) + block + value.slice(e), from: start, to: start + block.length };
}

/**
 * Markdown editor: Write / Preview tabs, a small formatting toolbar (WAI-ARIA toolbar, roving
 * tabindex), the textarea with its counter, and a preview. Ctrl/⌘ + B / I / K format.
 * `renderPreview(value)` plugs in the codebase's MarkdownText; the design side uses a small
 * safe renderer. Project descriptions, the public issue form, and (chrome only) the invite email.
 */
export function MarkdownEditor({
  id, label, hideLabel = false, value = '', onChange, placeholder, helperText, error, required = false, optional = false,
  maxLength, rows = 6, disabled = false, renderPreview, toolbar = true, className = '',
}) {
  const [mode, setMode] = React.useState('write');
  const [tool, setTool] = React.useState(0);
  const taRef = React.useRef(null);
  const barRef = React.useRef(null);
  const reactId = React.useId();
  const base = `${id || reactId}-mde`;
  const apply = (toolId) => {
    const ta = taRef.current;
    if (!ta || disabled) return;
    const r = edit(toolId, value, ta.selectionStart, ta.selectionEnd);
    if (onChange) onChange(r.next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(r.from, r.to); });
  };
  const onToolKey = (e, i) => {
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % TOOLS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TOOLS.length) % TOOLS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TOOLS.length - 1;
    if (n === null) return;
    e.preventDefault(); setTool(n);
    const el = barRef.current && barRef.current.querySelectorAll('[data-tool]')[n];
    if (el) el.focus();
  };
  const onTextKey = (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const t = TOOLS.find((x) => x.keys === e.key.toLowerCase());
    if (t) { e.preventDefault(); apply(t.id); }
  };

  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} optional={optional} helperText={helperText} error={error}
      count={maxLength != null ? value.length : undefined} max={maxLength} disabled={disabled} className={['gt-mde', className].filter(Boolean).join(' ')}>
      {({ id: taId, describedBy, invalid }) => (
        <div className="gt-mde__frame">
          <div className="gt-mde__bar">
            <div className="gt-mde__tabs">
              <Tabs idBase={base} size="sm" ariaLabel="Editor mode" value={mode} onChange={setMode}
                tabs={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
            </div>
            {toolbar && mode === 'write' && (
              <div className="gt-mde__toolbar" role="toolbar" aria-label="Formatting" aria-controls={taId} ref={barRef}>
                {TOOLS.map((t, i) => (
                  <IconButton key={t.id} size="sm" ariaLabel={t.label} tooltip={t.keys ? `${t.label} (Ctrl+${t.keys.toUpperCase()})` : t.label}
                    tooltipSide="bottom" tabIndex={i === tool ? 0 : -1} disabled={disabled}
                    onFocus={() => setTool(i)} onKeyDown={(e) => onToolKey(e, i)} onClick={() => apply(t.id)}
                    data-tool={t.id} onMouseDown={(e) => e.preventDefault()}>
                    {t.icon}
                  </IconButton>
                ))}
              </div>
            )}
          </div>
          <TabPanel idBase={base} value="write" active={mode === 'write'} focusable={false} keepMounted>
            <textarea
              ref={taRef}
              id={taId}
              className="gt-textarea"
              value={value}
              onChange={(e) => onChange && onChange(e.target.value)}
              onKeyDown={onTextKey}
              placeholder={placeholder}
              rows={rows}
              disabled={disabled}
              required={required}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          </TabPanel>
          <TabPanel idBase={base} value="preview" active={mode === 'preview'} className="gt-mde__preview">
            {value.trim() ? (renderPreview ? renderPreview(value) : renderMarkdownLite(value)) : <p className="gt-mde__empty">Nothing to preview yet.</p>}
          </TabPanel>
        </div>
      )}
    </FieldShell>
  );
}
