import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { WEEKDAYS, formatMeeting, type TeamMeetingItem } from './taTypes';
import './AddZoomModal.scss';

interface AddZoomModalProps {
  isOpen: boolean;
  team: TeamMeetingItem | null;
  onClose: () => void;
  onSaved: (projectId: string, fields: { zoomUrl: string; meetingDay: string | null; meetingTime: string | null }) => void;
}

const AddZoomModal: React.FC<AddZoomModalProps> = ({ isOpen, team, onClose, onSaved }) => {
  const [zoomUrl, setZoomUrl] = useState('');
  const [meetingDay, setMeetingDay] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed fields whenever a team is opened.
  useEffect(() => {
    if (isOpen && team) {
      setZoomUrl(team.zoomUrl ?? '');
      setMeetingDay(team.meetingDay ?? '');
      setMeetingTime(team.meetingTime ?? '');
      setError(null);
    }
  }, [isOpen, team]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSave = async () => {
    if (!team) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        zoom_url: zoomUrl.trim(),
        meeting_day: meetingDay || null,
        meeting_time: meetingTime.trim() || null,
      };
      await api.updateProjectMeeting(team.projectId, payload);
      onSaved(team.projectId, {
        zoomUrl: payload.zoom_url,
        meetingDay: payload.meeting_day,
        meetingTime: payload.meeting_time,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meeting');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  if ((!isOpen && !isClosing) || !team) return null;

  const subtitle = [team.teamName, formatMeeting(meetingDay, meetingTime)].filter(Boolean).join(' · ');

  return (
    <div className={`zoom-modal-backdrop ${isClosing ? 'closing' : ''}`} onClick={handleBackdropClick}>
      <div className={`zoom-modal ${isClosing ? 'closing' : ''}`}>
        <div className="zoom-modal__header">
          <h2 className="zoom-modal__title">{team.zoomUrl ? 'Edit Zoom link' : 'Add Zoom link'}</h2>
          <button className="zoom-modal__close" onClick={handleClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <p className="zoom-modal__context">{subtitle}</p>

        <div className="zoom-modal__field">
          <label className="zoom-modal__label" htmlFor="zoom-url">Zoom meeting URL</label>
          <input
            id="zoom-url"
            type="url"
            className="zoom-modal__input"
            placeholder="https://zoom.us/j/…"
            value={zoomUrl}
            onChange={(e) => setZoomUrl(e.target.value)}
          />
        </div>

        <div className="zoom-modal__row">
          <div className="zoom-modal__field">
            <label className="zoom-modal__label" htmlFor="zoom-day">Meeting day</label>
            <select
              id="zoom-day"
              className="zoom-modal__input"
              value={meetingDay}
              onChange={(e) => setMeetingDay(e.target.value)}
            >
              <option value="">—</option>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="zoom-modal__field">
            <label className="zoom-modal__label" htmlFor="zoom-time">Meeting time</label>
            <input
              id="zoom-time"
              type="text"
              className="zoom-modal__input"
              placeholder="2:00–2:30 PM"
              value={meetingTime}
              onChange={(e) => setMeetingTime(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="zoom-modal__error">{error}</div>}

        <div className="zoom-modal__actions">
          <button type="button" className="zoom-modal__cancel" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" className="zoom-modal__save" onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save link'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddZoomModal;
