import React, { useState } from 'react';

interface Props {
  /** Disabled when conversation is read-only (can_send=false). */
  disabled?: boolean;
  /** Banner text when disabled — e.g., "You no longer share a class with X." */
  disabledReason?: string;
  /** Send handler — should resolve when the POST completes. */
  onSend: (body: string) => Promise<void>;
}

const MAX_CODEPOINTS = 1024;

/** Counts Unicode code points (matches backend Q10=B). */
const codePointLength = (s: string) => [...s].length;

export const MessageComposer: React.FC<Props> = ({ disabled, disabledReason, onSend }) => {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = codePointLength(body);
  const canSend =
    !disabled && !pending && body.trim().length > 0 && length <= MAX_CODEPOINTS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    const captured = body;
    setBody('');
    setPending(true);
    setError(null);
    try {
      await onSend(captured);
    } catch (err) {
      setBody(captured);
      setError((err as Error).message || 'Couldn\'t send. Try again.');
    } finally {
      setPending(false);
    }
  };

  if (disabled) {
    return (
      <div className="messages-composer messages-composer--disabled">
        {disabledReason ?? 'This conversation is read-only.'}
      </div>
    );
  }

  return (
    <form className="messages-composer" onSubmit={handleSubmit}>
      <textarea
        className="messages-composer__input"
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Send a message..."
        rows={1}
        disabled={pending}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <div className="messages-composer__footer">
        <span
          className={`messages-composer__counter ${
            length > MAX_CODEPOINTS ? 'messages-composer__counter--over' : ''
          }`}
        >
          {length} / {MAX_CODEPOINTS}
        </span>
        {error && <span className="messages-composer__error">{error}</span>}
        <button type="submit" disabled={!canSend} className="messages-composer__send">
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
};
