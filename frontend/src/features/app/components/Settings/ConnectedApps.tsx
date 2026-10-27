import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@components/Button/Button';
import { api, type ApiMcpConnection } from '@/lib/api';

const LOAD_FAILED = "Couldn't load your connected apps.";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The Connected apps section of Settings: the AI assistants the student allowed to read and add to
 * their scrum boards (the MCP connector), each with a Disconnect button that ends its access at once.
 * Mounted while the section is shown, so each visit reads the list again.
 */
const ConnectedApps: React.FC = () => {
  const [connections, setConnections] = useState<ApiMcpConnection[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.getMcpConnections().then(
      (res) => {
        if (!cancelled) setConnections(res.connections);
      },
      () => {
        if (!cancelled) setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    headingRef.current?.focus();
    setLoadError(false);
    setAttempt((n) => n + 1);
  };

  const disconnect = async (app: ApiMcpConnection) => {
    // The row's button goes away on success: focus falls back to the heading, not the page.
    headingRef.current?.focus();
    setRemoving(app.client_id);
    setError(null);
    try {
      await api.disconnectMcpConnection(app.client_id);
      setConnections((list) => (list ?? []).filter((c) => c.client_id !== app.client_id));
    } catch {
      setError(`Couldn't disconnect ${app.app_name}. Try again.`);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <>
      <h3 ref={headingRef} tabIndex={-1} className="settings-modal__section-title">
        Connected apps
      </h3>
      <p className="settings-modal__section-subtitle">
        AI assistants you allowed to read your teams' scrum boards and add items to them. Disconnecting ends an
        app's access straight away.
      </p>
      {connections ? (
        connections.length === 0 ? (
          <p className="settings-modal__pref-status">No apps are connected.</p>
        ) : (
          <ul className="settings-modal__pref-list">
            {connections.map((app) => (
              <li key={app.client_id} className="settings-modal__pref">
                <div className="settings-modal__pref-text">
                  <span className="settings-modal__pref-label">{app.app_name}</span>
                  <p className="settings-modal__pref-description">
                    Connected {day(app.connected_at)}
                    {app.last_used_at ? ` · last used ${day(app.last_used_at)}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger-ghost"
                  aria-label={`Disconnect ${app.app_name}`}
                  disabled={removing !== null}
                  loading={removing === app.client_id}
                  onClick={() => void disconnect(app)}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : loadError ? (
        <>
          <p className="settings-modal__feedback settings-modal__feedback--error" role="alert">
            <AlertCircle size={15} />
            {LOAD_FAILED}
          </p>
          <button type="button" className="settings-modal__retry" onClick={retry}>
            Try again
          </button>
        </>
      ) : (
        <p className="settings-modal__pref-status" role="status">
          Loading…
        </p>
      )}
      {error && (
        <p className="settings-modal__feedback settings-modal__feedback--error" role="alert">
          <AlertCircle size={15} />
          {error}
        </p>
      )}
    </>
  );
};

export default ConnectedApps;
