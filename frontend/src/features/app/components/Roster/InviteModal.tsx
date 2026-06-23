import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { X, Loader2, RotateCcw, Link, Hash } from 'lucide-react';
import './InviteModal.scss';

export interface InvitePayload {
  emails: string[];
  subject: string;
  body: string;
}

interface Draft {
  recipients: string[];
  subject: string;
  body: string;
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

// Convert plain-text body to HTML with token spans for the contenteditable
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

// Serialize contenteditable DOM back to plain text (token spans emit their data-value)
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
      if (node.tagName === 'BR') { out += '\n'; return; }
      if (node.tagName === 'DIV' && out.length > 0 && !out.endsWith('\n')) out += '\n';
      node.childNodes.forEach(walk);
    }
  };
  div.childNodes.forEach(walk);
  return out;
}

// ── Body editor ───────────────────────────────────────────────────────────────
interface BodyEditorProps {
  htmlContent: string;          // initial/reset HTML
  resetSignal: number;          // increment to re-initialize the DOM
  onChange: (plainText: string) => void;
  url: string;
  courseCode: string;
}

const BodyEditor: React.FC<BodyEditorProps> = ({ htmlContent, resetSignal, onChange, url, courseCode }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [missingSignup, setMissingSignup] = useState(false);
  const [missingCode, setMissingCode] = useState(false);

  // Re-initialize DOM when resetSignal changes
  useEffect(() => {
    if (!divRef.current) return;
    divRef.current.innerHTML = htmlContent;
    refreshPresence();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const refreshPresence = () => {
    if (!divRef.current) return;
    setMissingSignup(!divRef.current.querySelector(`[data-token="${TOKEN_SIGNUP}"]`));
    setMissingCode(!divRef.current.querySelector(`[data-token="${TOKEN_CODE}"]`));
  };

  const handleInput = () => {
    if (!divRef.current) return;
    onChange(domToPlainText(divRef.current));
    refreshPresence();
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
      // Ensure cursor is inside the editor
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

    if (divRef.current) onChange(domToPlainText(divRef.current));
    refreshPresence();
  };

  return (
    <div className="invite-modal__body-editor">
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        className="invite-modal__field-textarea"
        onInput={handleInput}
      />
      {(missingSignup || missingCode) && (
        <div className="invite-modal__token-row">
          <span className="invite-modal__token-row-label">Re-insert:</span>
          {missingSignup && (
            <button
              type="button"
              className="invite-modal__token-insert"
              onClick={() => insertToken(TOKEN_SIGNUP)}
            >
              <Link size={11} /> Signup link
            </button>
          )}
          {missingCode && (
            <button
              type="button"
              className="invite-modal__token-insert"
              onClick={() => insertToken(TOKEN_CODE)}
            >
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
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyResetSignal, setBodyResetSignal] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);

  const prevIsOpenRef = useRef(false);
  const stateRef = useRef({ recipients, subject, body });
  stateRef.current = { recipients, subject, body };
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const applyContent = useCallback((r: string[], s: string, b: string) => {
    setRecipients(r);
    setSubject(s);
    setBody(b);
    setBodyHtml(bodyToHtml(b, signupUrl(), courseCode));
    setBodyResetSignal((n) => n + 1);
  }, [courseCode]);

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      setInputValue('');
      setInputError('');
      applyContent(
        initialEmails,
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
    const { recipients: r, subject: s, body: b } = stateRef.current;
    const defS = defaultSubject(className);
    const defB = defaultBody(className, courseCode);
    const isDefault =
      s === defS && b === defB &&
      r.length === initialEmails.length &&
      r.every((e, i) => e === initialEmails[i]);

    if (!isDefault) {
      saveDraft(courseCode, { recipients: r, subject: s, body: b });
      setHasDraft(true);
    }
    onClose();
  }, [onClose, className, courseCode, initialEmails]);

  const restoreDraft = () => {
    const draft = loadDraft(courseCode);
    if (!draft) return;
    applyContent(draft.recipients, draft.subject, draft.body);
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

  const removeRecipient = (email: string) =>
    setRecipients((prev) => prev.filter((e) => e !== email));

  const addRecipient = () => {
    const email = inputValue.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setInputError('Enter a valid email address'); return; }
    if (recipients.includes(email)) { setInputError('Already in the list'); return; }
    setRecipients((prev) => [...prev, email]);
    setInputValue('');
    setInputError('');
  };

  const handleSend = () => {
    clearDraft(courseCode);
    setHasDraft(false);
    onSend({ emails: recipients, subject, body });
  };

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

        <div className="invite-modal__body">
          {/* Recipients */}
          <section className="invite-modal__section">
            <h3 className="invite-modal__section-title">
              Recipients
              <span className="invite-modal__count">{recipients.length}</span>
            </h3>
            <div className="invite-modal__chips">
              {recipients.length === 0 ? (
                <span className="invite-modal__no-recipients">No recipients added</span>
              ) : (
                recipients.map((email) => (
                  <button
                    key={email}
                    type="button"
                    className="invite-modal__chip"
                    onClick={() => removeRecipient(email)}
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
                className={`invite-modal__add-input${inputError ? ' invite-modal__add-input--error' : ''}`}
                placeholder="Add email address"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); if (inputError) setInputError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
              />
              <button type="button" className="invite-modal__add-btn" onClick={addRecipient}>
                Add
              </button>
            </div>
            {inputError && <p className="invite-modal__input-error">{inputError}</p>}
          </section>

          {/* Email content */}
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
              url={signupUrl()}
              courseCode={courseCode}
            />
          </section>

          {errorMessage && <p className="invite-modal__error" role="alert">{errorMessage}</p>}
        </div>

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
