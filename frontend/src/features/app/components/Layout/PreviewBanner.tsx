import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePreview } from '@/lib/previewContext';
import './PreviewBanner.scss';

/**
 * Sticky bar shown while an instructor is in "View as Student" preview. It
 * keeps the read-only state visible at all times and offers a one-click exit.
 * Also surfaces a transient toast when a blocked write is attempted (the API
 * guard dispatches a `preview:blocked` window event).
 */
const PreviewBanner: React.FC = () => {
  const { isPreviewing } = useAuth();
  const { exitPreview } = usePreview();
  const navigate = useNavigate();
  const [blockedToast, setBlockedToast] = useState(false);

  useEffect(() => {
    if (!isPreviewing) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onBlocked = () => {
      setBlockedToast(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBlockedToast(false), 2600);
    };
    window.addEventListener('preview:blocked', onBlocked);
    return () => {
      window.removeEventListener('preview:blocked', onBlocked);
      clearTimeout(timer);
    };
  }, [isPreviewing]);

  if (!isPreviewing) return null;

  const handleExit = () => {
    exitPreview();
    // Back to a guaranteed-instructor route (student-only paths would bounce).
    navigate('/app/home');
  };

  return (
    <>
      <div className="preview-banner" role="status">
        <span className="preview-banner__label">
          <Eye size={16} className="preview-banner__eye" />
          Previewing as student
          <span className="preview-banner__pill">
            <Lock size={11} /> Read only
          </span>
        </span>
        <button type="button" className="preview-banner__exit" onClick={handleExit}>
          <X size={15} />
          Exit preview
        </button>
      </div>

      {blockedToast && (
        <div className="preview-banner__toast" role="alert">
          <Lock size={14} />
          Read-only preview — changes are disabled.
        </div>
      )}
    </>
  );
};

export default PreviewBanner;
