import React, { useState, useEffect } from 'react';
import { Linkedin, Github } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabaseClient';
import './Portfolio.scss';

const Portfolio: React.FC = () => {
  const { user } = useAuth();

  const [linkedIn, setLinkedIn] = useState('');
  const [github, setGithub] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, string>;
    setLinkedIn(meta.linkedin_username || '');
    setGithub(meta.github_username || '');
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          linkedin_username: linkedIn.trim(),
          github_username: github.trim(),
        },
      });
      if (error) throw error;
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="portfolio-block">
      <h3 className="portfolio-block__title">Portfolio Links</h3>
      <p className="portfolio-block__subtitle">
        Add your professional profiles so teammates can learn more about you.
      </p>

      <div className="portfolio-block__form">
        <div className="portfolio-block__field">
          <label className="portfolio-block__label" htmlFor="portfolio-linkedin">
            LinkedIn Username
          </label>
          <div className="portfolio-block__input-group">
            <span className="portfolio-block__prefix">
              <Linkedin size={13} />
              linkedin.com/in/
            </span>
            <input
              id="portfolio-linkedin"
              type="text"
              className="portfolio-block__input"
              value={linkedIn}
              onChange={(e) => { setLinkedIn(e.target.value); setSaveStatus('idle'); }}
              placeholder="your-username"
            />
          </div>
        </div>

        <div className="portfolio-block__field">
          <label className="portfolio-block__label" htmlFor="portfolio-github">
            GitHub Username
          </label>
          <div className="portfolio-block__input-group">
            <span className="portfolio-block__prefix">
              <Github size={13} />
              github.com/
            </span>
            <input
              id="portfolio-github"
              type="text"
              className="portfolio-block__input"
              value={github}
              onChange={(e) => { setGithub(e.target.value); setSaveStatus('idle'); }}
              placeholder="your-username"
            />
          </div>
        </div>

        {saveStatus === 'error' && (
          <p className="portfolio-block__feedback portfolio-block__feedback--error">
            {errorMessage}
          </p>
        )}
        {saveStatus === 'success' && (
          <p className="portfolio-block__feedback portfolio-block__feedback--success">
            Portfolio saved successfully.
          </p>
        )}

        <div className="portfolio-block__footer">
          <button
            type="button"
            className="portfolio-block__save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Portfolio;
