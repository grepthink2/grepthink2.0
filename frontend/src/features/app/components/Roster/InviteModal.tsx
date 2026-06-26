import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  X, Loader2, RotateCcw, Link, Hash,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
} from 'lucide-react';
import './InviteModal.scss';

export interface InvitePayload {
  emails: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  bodyHtml: string;
}

interface Draft {
  recipients: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (payload: InvitePayload) => void;
  initialEmails: string[];
  className: string;
  courseCode: string;
  isSending: boolean;
  errorMessage?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_SIGNUP = 'SIGNUP_LINK';
const TOKEN_CODE = 'ACCESS_CODE';

const draftKey = (courseCode: string) => `invite_draft_${courseCode}`;

function saveDraft(courseCode: string, draft: Draft) {
  try { localStorage.setItem(draftKey(courseCode), JSON.stringify(draft)); } catch {}
}

function loadDraft(courseCode: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(courseCode));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch { return null; }
}

function clearDraft(courseCode: string) {
  try { localStorage.removeItem(draftKey(courseCode)); } catch {}
}

function defaultSubject(cls: string) {
  return `Join ${cls} on GrepThink`;
}

function defaultBody(cls: string, courseCode: string) {
  const url = `${window.location.origin}/studentsignup`;
  return `Your instructor has invited you to join ${cls} on GrepThink.\n\n1. Create your student account: ${url}\n2. After signing up, join the class with access code: ${courseCode}`;
}

function signupUrl() {
  return `${window.location.origin}/studentsignup`;
}

function bodyToHtml(text: string, url: string, code: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const tokenSpan = (type: string, value: string) =>
    `<span contenteditable="false" data-token="${type}" data-value="${esc(value)}" class="invite-modal__token">${esc(value)}</span>`;

  let html = esc(text);
  html = html.replace(new RegExp(reEsc(esc(url)), 'g'), tokenSpan(TOKEN_SIGNUP, url));
  html = html.replace(new RegExp(reEsc(esc(code)), 'g'), tokenSpan(TOKEN_CODE, code));
  html = html.replace(/\n/g, '<br>');
  return html;
}

function domToPlainText(div: HTMLDivElement): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
    } else if (node instanceof HTMLElement) {
      if (node.dataset.token) {
        out += node.dataset.value ?? node.textContent ?? '';
        return;
      }
      const tag = node.tagName.toUpperCase();
      if (tag === 'BR') { out += '\n'; return; }
      if (['P', 'DIV', 'H1', 'H2', 'H3'].includes(tag) && out.length > 0 && !out.endsWith('\n')) {
        out += '\n';
      }
      if (tag === 'LI') {
        if (out.length > 0 && !out.endsWith('\n')) out += '\n';
        const parentTag = node.parentElement?.tagName.toUpperCase();
        if (parentTag === 'OL') {
          const idx = Array.from(node.parentElement!.children).indexOf(node) + 1;
          out += `${idx}. `;
        } else {
          out += '• ';
        }
      }
      node.childNodes.forEach(walk);
      if (['P', 'DIV', 'LI', 'H1', 'H2', 'H3'].includes(tag) && !out.endsWith('\n')) {
        out += '\n';
      }
    }
  };
  div.childNodes.forEach(walk);
  return out;
}

// ── Reusable email chip input section ────────────────────────────────────────
interface EmailInputSectionProps {
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  emptyText?: string;
}

const EmailInputSection: React.FC<EmailInputSectionProps> = ({
  emails, onChange, placeholder, emptyText,
}) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const e = input.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { setError('Enter a valid email address'); return; }
    if (emails.includes(e)) { setError('Already in the list'); return; }
    onChange([...emails, e]);
    setInput('');
    setError('');
  };

  const remove = (email: string) => onChange(emails.filter((e) => e !== email));

  return (
    <>
      <div className="invite-modal__chips">
        {emails.length === 0 ? (
          <span className="invite-modal__no-recipients">{emptyText ?? 'No addresses added'}</span>
        ) : (
          emails.map((email) => (
            <button
              key={email}
              type="button"
              className="invite-modal__chip"
              onClick={() => remove(email)}
              aria-label={`Remove ${email}`}
            >
              {email}
              <X size={11} className="invite-modal__chip-x" />
            </button>
          ))
        )}
      </div>
      <div className="invite-modal__add-row">
        <input
          type="email"
          className={`invite-modal__add-input${error ? ' invite-modal__add-input--error' : ''}`}
          placeholder={placeholder ?? 'Add email address'}
          value={input}
          onChange={(e) => { setInput(e.target.value); if (error) setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="invite-modal__add-btn" onClick={add}>Add</button>
      </div>
      {error && <p className="invite-modal__input-error">{error}</p>}
    </>
  );
};

// ── Body editor ───────────────────────────────────────────────────────────────
interface BodyEditorProps {
  htmlContent: string;
  resetSignal: number;
  onChange: (plainText: string) => void;
  onHtmlChange: (html: string) => void;
  url: string;
  courseCode: string;
}

const BodyEditor: React.FC<BodyEditorProps> = ({ htmlContent, resetSignal, onChange, onHtmlChange, url, courseCode }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const editingLinkRef = useRef<HTMLAnchorElement | null>(null);
  const linkTextInputRef = useRef<HTMLInputElement>(null);
  const [missingSignup, setMissingSignup] = useState(false);
  const [missingCode, setMissingCode] = useState(false);
  const [editorHeight, setEditorHeight] = useState(160);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    if (!divRef.current) return;
    setShowLinkPanel(false);
    divRef.current.innerHTML = htmlContent;
    refreshPresence();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (!showLinkPanel) return;
    requestAnimationFrame(() => linkTextInputRef.current?.focus());
  }, [showLinkPanel]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleLinkPanel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  // toggleLinkPanel reads showLinkPanel via closure — re-register when it changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLinkPanel]);

  const refreshPresence = () => {
    if (!divRef.current) return;
    setMissingSignup(!divRef.current.querySelector(`[data-token="${TOKEN_SIGNUP}"]`));
    setMissingCode(!divRef.current.querySelector(`[data-token="${TOKEN_CODE}"]`));
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && divRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const getAnchorFromNode = (node: Node | null): HTMLAnchorElement | null => {
    let n: Node | null = node;
    while (n && n !== divRef.current) {
      if (n instanceof HTMLAnchorElement) return n;
      n = n.parentNode;
    }
    return null;
  };

  const closeLinkPanel = () => {
    setShowLinkPanel(false);
    setLinkText('');
    setLinkUrl('');
    editingLinkRef.current = null;
    divRef.current?.focus();
  };

  const openLinkPanel = () => {
    saveSelection();
    const range = savedRangeRef.current;
    const anchor = range ? getAnchorFromNode(range.startContainer) : null;

    if (anchor) {
      editingLinkRef.current = anchor;
      setLinkText(anchor.textContent ?? '');
      setLinkUrl(anchor.getAttribute('href') ?? '');
    } else {
      editingLinkRef.current = null;
      setLinkText(range && !range.collapsed ? range.toString() : '');
      setLinkUrl('https://');
    }
    setShowLinkPanel(true);
  };

  const toggleLinkPanel = () => {
    if (showLinkPanel) { closeLinkPanel(); } else { openLinkPanel(); }
  };

  const refreshActiveFormats = () => {
    const formats = new Set<string>();
    try {
      if (document.queryCommandState('bold')) formats.add('bold');
      if (document.queryCommandState('italic')) formats.add('italic');
      if (document.queryCommandState('underline')) formats.add('underline');
      if (document.queryCommandState('strikeThrough')) formats.add('strikeThrough');
      if (document.queryCommandState('insertUnorderedList')) formats.add('insertUnorderedList');
      if (document.queryCommandState('insertOrderedList')) formats.add('insertOrderedList');
    } catch { /* execCommand unavailable in some contexts */ }
    setActiveFormats(formats);
  };

  const handleInput = () => {
    if (!divRef.current) return;
    onChange(domToPlainText(divRef.current));
    onHtmlChange(divRef.current.innerHTML);
    refreshPresence();
  };

  const execFormat = (command: string, value?: string) => {
    divRef.current?.focus();
    document.execCommand(command, false, value);
    if (divRef.current) {
      onChange(domToPlainText(divRef.current));
      onHtmlChange(divRef.current.innerHTML);
    }
    refreshPresence();
    refreshActiveFormats();
  };

  const insertToken = (type: typeof TOKEN_SIGNUP | typeof TOKEN_CODE) => {
    const value = type === TOKEN_SIGNUP ? url : courseCode;
    if (!divRef.current) return;
    divRef.current.focus();

    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.dataset.token = type;
    span.dataset.value = value;
    span.className = 'invite-modal__token';
    span.textContent = value;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (divRef.current.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(span);
        range.setStartAfter(span);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        divRef.current.appendChild(span);
      }
    } else {
      divRef.current.appendChild(span);
    }

    if (divRef.current) {
      onChange(domToPlainText(divRef.current));
      onHtmlChange(divRef.current.innerHTML);
    }
    refreshPresence();
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: editorHeight };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      setEditorHeight(Math.max(80, Math.min(600, dragRef.current.startHeight + delta)));
    };

    const onMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const applyLink = () => {
    const text = linkText.trim();
    const href = linkUrl.trim();
    if (!text || !href) return;

    if (editingLinkRef.current) {
      editingLinkRef.current.href = href;
      editingLinkRef.current.textContent = text;
      handleInput();
    } else if (savedRangeRef.current) {
      const range = savedRangeRef.current;
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text;
      range.deleteContents();
      range.insertNode(a);
      range.setStartAfter(a);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      handleInput();
    }

    closeLinkPanel();
  };

  const removeLink = () => {
    if (editingLinkRef.current) {
      const textNode = document.createTextNode(editingLinkRef.current.textContent ?? '');
      editingLinkRef.current.replaceWith(textNode);
      handleInput();
    }
    closeLinkPanel();
  };

  const handleEditorMouseUp = () => { saveSelection(); refreshActiveFormats(); };
  const handleEditorKeyUp = () => { saveSelection(); refreshActiveFormats(); };

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      // Save selection before the document-level listener fires toggleLinkPanel
      saveSelection();
    }
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (anchor && divRef.current?.contains(anchor)) {
      e.preventDefault();
      editingLinkRef.current = anchor;
      setLinkText(anchor.textContent ?? '');
      setLinkUrl(anchor.getAttribute('href') ?? '');
      setShowLinkPanel(true);
    }
  };

  const tbBtn = (
    _fmt: string,
    active: boolean,
    onDown: () => void,
    title: string,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      className={`invite-modal__toolbar-btn${active ? ' invite-modal__toolbar-btn--active' : ''}`}
      onMouseDown={(e) => { e.preventDefault(); onDown(); }}
      title={title}
    >
      {icon}
    </button>
  );

  return (
    <div className="invite-modal__body-editor">
      {/* ── Toolbar ── */}
      <div className="invite-modal__toolbar">
        {tbBtn('bold', activeFormats.has('bold'), () => execFormat('bold'), 'Bold', <Bold size={14} strokeWidth={2} />)}
        {tbBtn('italic', activeFormats.has('italic'), () => execFormat('italic'), 'Italic', <Italic size={14} strokeWidth={2} />)}
        {tbBtn('underline', activeFormats.has('underline'), () => execFormat('underline'), 'Underline', <Underline size={14} strokeWidth={2} />)}
        {tbBtn('strikeThrough', activeFormats.has('strikeThrough'), () => execFormat('strikeThrough'), 'Strikethrough', <Strikethrough size={14} strokeWidth={2} />)}
        <div className="invite-modal__toolbar-sep" />
        {tbBtn('ul', activeFormats.has('insertUnorderedList'), () => execFormat('insertUnorderedList'), 'Bullet list', <List size={14} strokeWidth={2} />)}
        {tbBtn('ol', activeFormats.has('insertOrderedList'), () => execFormat('insertOrderedList'), 'Numbered list', <ListOrdered size={14} strokeWidth={2} />)}
        <div className="invite-modal__toolbar-sep" />
        {tbBtn('link', showLinkPanel, () => { saveSelection(); toggleLinkPanel(); }, 'Insert link (⌘K)', <Link size={14} strokeWidth={2} />)}
      </div>

      {/* ── Scrollable editor with resize handle + floating link panel ── */}
      <div ref={editorWrapRef} className="invite-modal__editor-wrap" style={{ height: editorHeight }}>
        <div
          ref={divRef}
          contentEditable
          suppressContentEditableWarning
          className="invite-modal__field-textarea"
          onInput={handleInput}
          onKeyUp={handleEditorKeyUp}
          onMouseUp={handleEditorMouseUp}
          onKeyDown={handleEditorKeyDown}
          onClick={handleEditorClick}
        />

        {showLinkPanel && (
          <div className="invite-modal__link-panel">
            <div className="invite-modal__link-panel-header">
              <span className="invite-modal__link-panel-title">
                {editingLinkRef.current ? 'Edit link' : 'Add link'}
              </span>
              <button type="button" className="invite-modal__link-cancel" onClick={closeLinkPanel} aria-label="Close">
                <X size={12} />
              </button>
            </div>
            <div className="invite-modal__link-fields">
              <label className="invite-modal__link-field">
                <span className="invite-modal__link-field-label">Text</span>
                <input
                  ref={linkTextInputRef}
                  type="text"
                  className="invite-modal__link-input"
                  placeholder="Link text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                    if (e.key === 'Escape') closeLinkPanel();
                  }}
                />
              </label>
              <label className="invite-modal__link-field">
                <span className="invite-modal__link-field-label">URL</span>
                <input
                  type="url"
                  className="invite-modal__link-input"
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                    if (e.key === 'Escape') closeLinkPanel();
                  }}
                />
              </label>
            </div>
            <div className="invite-modal__link-actions">
              {editingLinkRef.current && (
                <button type="button" className="invite-modal__link-remove" onClick={removeLink}>
                  Remove
                </button>
              )}
              <button type="button" className="invite-modal__link-apply" onClick={applyLink}>Apply</button>
            </div>
          </div>
        )}

        <div className="invite-modal__resize-handle" onMouseDown={handleResizeMouseDown} title="Drag to resize" />
      </div>

      {/* ── Missing token warnings ── */}
      {(missingSignup || missingCode) && (
        <div className="invite-modal__token-row">
          <span className="invite-modal__token-row-label">Re-insert:</span>
          {missingSignup && (
            <button type="button" className="invite-modal__token-insert" onClick={() => insertToken(TOKEN_SIGNUP)}>
              <Link size={11} /> Signup link
            </button>
          )}
          {missingCode && (
            <button type="button" className="invite-modal__token-insert" onClick={() => insertToken(TOKEN_CODE)}>
              <Hash size={11} /> Access code
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main modal ────────────────────────────────────────────────────────────────
const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  onSend,
  initialEmails,
  className,
  courseCode,
  isSending,
  errorMessage,
}) => {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyResetSignal, setBodyResetSignal] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);

  const prevIsOpenRef = useRef(false);
  const stateRef = useRef({ recipients, cc, bcc, subject, body, bodyHtml });
  stateRef.current = { recipients, cc, bcc, subject, body, bodyHtml };
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const applyContent = useCallback((
    r: string[], c: string[], b: string[], s: string, bd: string,
    bdHtml?: string,
  ) => {
    setRecipients(r);
    setCc(c);
    setBcc(b);
    setSubject(s);
    setBody(bd);
    setBodyHtml(bdHtml ?? bodyToHtml(bd, signupUrl(), courseCode));
    setBodyResetSignal((n) => n + 1);
  }, [courseCode]);

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      setShowCc(false);
      setShowBcc(false);
      applyContent(
        initialEmails, [], [],
        defaultSubject(className),
        defaultBody(className, courseCode),
      );
      setHasDraft(loadDraft(courseCode) !== null);
      triggerRef.current = document.activeElement as Element;
      setTimeout(() => firstFocusRef.current?.focus(), 0);
    }
    if (!isOpen && wasOpen) {
      (triggerRef.current as HTMLElement | null)?.focus();
    }
  }, [isOpen, initialEmails, className, courseCode, applyContent]);

  const handleClose = useCallback(() => {
    const { recipients: r, cc: c, bcc: b, subject: s, body: bd, bodyHtml: bh } = stateRef.current;
    const defS = defaultSubject(className);
    const defB = defaultBody(className, courseCode);
    const isDefault =
      s === defS && bd === defB &&
      r.length === initialEmails.length &&
      r.every((e, i) => e === initialEmails[i]) &&
      c.length === 0 && b.length === 0;

    if (!isDefault) {
      saveDraft(courseCode, { recipients: r, cc: c, bcc: b, subject: s, body: bd, bodyHtml: bh });
      setHasDraft(true);
    }
    onClose();
  }, [onClose, className, courseCode, initialEmails]);

  const restoreDraft = () => {
    const draft = loadDraft(courseCode);
    if (!draft) return;
    applyContent(
      draft.recipients,
      draft.cc ?? [],
      draft.bcc ?? [],
      draft.subject,
      draft.body,
      draft.bodyHtml,
    );
    if ((draft.cc ?? []).length > 0) setShowCc(true);
    if ((draft.bcc ?? []).length > 0) setShowBcc(true);
    setHasDraft(false);
  };

  const discardDraft = () => {
    clearDraft(courseCode);
    setHasDraft(false);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); },
    [handleClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const handleSend = () => {
    clearDraft(courseCode);
    setHasDraft(false);
    onSend({ emails: recipients, cc, bcc, subject, body, bodyHtml });
  };

  const totalRecipients = recipients.length + cc.length + bcc.length;

  if (!isOpen) return null;

  const modal = (
    <div
      className="invite-modal__overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      <div className="invite-modal">
        {/* ── Header ── */}
        <div className="invite-modal__header">
          <h2 className="invite-modal__title" id="invite-modal-title">
            Send Invitation Emails
          </h2>
          <button
            ref={firstFocusRef}
            className="invite-modal__close"
            onClick={handleClose}
            type="button"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Draft banner ── */}
        {hasDraft && (
          <div className="invite-modal__draft-banner">
            <RotateCcw size={13} />
            <span>You have a saved draft from this session.</span>
            <button type="button" className="invite-modal__draft-restore" onClick={restoreDraft}>
              Restore draft
            </button>
            <button type="button" className="invite-modal__draft-discard" onClick={discardDraft} aria-label="Discard draft">
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="invite-modal__body">

          {/* Recipients section */}
          <section className="invite-modal__section">
            <div className="invite-modal__section-header">
              <h3 className="invite-modal__section-title">
                Recipients
                <span className="invite-modal__count">{totalRecipients}</span>
              </h3>
              <div className="invite-modal__cc-bcc-toggle">
                <button
                  type="button"
                  className={`invite-modal__cc-btn${showCc ? ' invite-modal__cc-btn--active' : ''}`}
                  onClick={() => setShowCc((v) => !v)}
                >
                  CC
                </button>
                <button
                  type="button"
                  className={`invite-modal__cc-btn${showBcc ? ' invite-modal__cc-btn--active' : ''}`}
                  onClick={() => setShowBcc((v) => !v)}
                >
                  BCC
                </button>
              </div>
            </div>

            {/* TO */}
            <p className="invite-modal__field-label">To</p>
            <EmailInputSection
              emails={recipients}
              onChange={setRecipients}
              placeholder="Add recipient email"
              emptyText="No recipients added"
            />

            {/* CC */}
            {showCc && (
              <div className="invite-modal__sub-field">
                <p className="invite-modal__field-label">CC</p>
                <EmailInputSection
                  emails={cc}
                  onChange={setCc}
                  placeholder="Add CC email"
                  emptyText="No CC addresses"
                />
              </div>
            )}

            {/* BCC */}
            {showBcc && (
              <div className="invite-modal__sub-field">
                <p className="invite-modal__field-label">BCC</p>
                <EmailInputSection
                  emails={bcc}
                  onChange={setBcc}
                  placeholder="Add BCC email"
                  emptyText="No BCC addresses"
                />
              </div>
            )}
          </section>

          {/* Email content section */}
          <section className="invite-modal__section">
            <h3 className="invite-modal__section-title">Email Content</h3>

            <label className="invite-modal__field-label" htmlFor="invite-subject">Subject</label>
            <input
              id="invite-subject"
              type="text"
              className="invite-modal__field-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />

            <label className="invite-modal__field-label" htmlFor="invite-body">Body</label>
            <BodyEditor
              htmlContent={bodyHtml}
              resetSignal={bodyResetSignal}
              onChange={setBody}
              onHtmlChange={setBodyHtml}
              url={signupUrl()}
              courseCode={courseCode}
            />
          </section>

          {errorMessage && <p className="invite-modal__error" role="alert">{errorMessage}</p>}
        </div>

        {/* ── Footer ── */}
        <div className="invite-modal__footer">
          <button
            type="button"
            className="invite-modal__btn invite-modal__btn--cancel"
            onClick={handleClose}
            disabled={isSending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="invite-modal__btn invite-modal__btn--send"
            onClick={handleSend}
            disabled={isSending || recipients.length === 0 || !subject.trim()}
          >
            {isSending ? (
              <><Loader2 size={14} className="invite-modal__spinner" />Sending…</>
            ) : (
              `Send ${recipients.length} invitation${recipients.length !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

export default InviteModal;
