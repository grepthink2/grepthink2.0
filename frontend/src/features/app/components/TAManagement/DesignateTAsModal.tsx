import React, { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { api, type ApiClassTa } from '@/lib/api';
import { getInitials } from '@features/app/utils/memberUtils';
import './DesignateTAsModal.scss';

interface DesignateTAsModalProps {
  isOpen: boolean;
  classId: string | null;
  onClose: () => void;
  /** Called after any change so the page can refresh TA options / roles. */
  onChanged: () => void;
}

const DesignateTAsModal: React.FC<DesignateTAsModalProps> = ({ isOpen, classId, onClose, onChanged }) => {
  const [rows, setRows] = useState<ApiClassTa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isOpen || !classId) return;
    let active = true;
    setLoading(true);
    setError(null);
    api.getClassTaRoster(classId)
      .then((res) => { if (active) setRows(res.tas); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Failed to load students'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, classId]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      if (dirty) onChanged();
      setDirty(false);
      onClose();
    }, 200);
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) handleClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, dirty]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const toggle = async (row: ApiClassTa) => {
    if (!classId) return;
    const next = !row.is_ta;
    setPending(row.user_id);
    setRows((prev) => prev.map((r) => (r.user_id === row.user_id ? { ...r, is_ta: next } : r)));
    try {
      await api.setClassTA(classId, row.user_id, next);
      setDirty(true);
    } catch (err) {
      // rollback
      setRows((prev) => prev.map((r) => (r.user_id === row.user_id ? { ...r, is_ta: !next } : r)));
      setError(err instanceof Error ? err.message : 'Failed to update TA');
    } finally {
      setPending(null);
    }
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div className={`designate-modal-backdrop ${isClosing ? 'closing' : ''}`} onClick={handleBackdrop}>
      <div className={`designate-modal ${isClosing ? 'closing' : ''}`}>
        <div className="designate-modal__header">
          <h2 className="designate-modal__title">Manage TAs</h2>
          <button className="designate-modal__close" onClick={handleClose} aria-label="Close"><X size={22} /></button>
        </div>
        <p className="designate-modal__hint">Designate enrolled students as TAs for this class. TAs can run meetings and take attendance for teams they're assigned to.</p>

        <div className="designate-modal__list">
          {loading ? (
            <p className="designate-modal__empty">Loading students…</p>
          ) : rows.length === 0 ? (
            <p className="designate-modal__empty">No enrolled students yet.</p>
          ) : (
            rows.map((r) => (
              <div className="designate-modal__row" key={r.user_id}>
                <span className="designate-modal__avatar" aria-hidden="true">
                  {getInitials(r.name || '', r.email || '')}
                </span>
                <div className="designate-modal__person">
                  <span className="designate-modal__name">{r.name}</span>
                  {r.email && <span className="designate-modal__email">{r.email}</span>}
                </div>
                <button
                  type="button"
                  className={`designate-modal__toggle ${r.is_ta ? 'is-ta' : ''}`}
                  onClick={() => toggle(r)}
                  disabled={pending === r.user_id}
                >
                  {r.is_ta ? (<><Check size={14} /> TA</>) : 'Make TA'}
                </button>
              </div>
            ))
          )}
        </div>

        {error && <div className="designate-modal__error">{error}</div>}

        <div className="designate-modal__actions">
          <button type="button" className="designate-modal__done" onClick={handleClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

export default DesignateTAsModal;
