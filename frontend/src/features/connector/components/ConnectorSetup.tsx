import { useState } from 'react';
import { Button } from '@components/Button/Button';
import './ConnectorSetup.scss';

/**
 * The MCP connector's address (backend `app/mcp`) with a Copy button, and where Claude and ChatGPT
 * take it: the board's "Connect an AI assistant" popover and the student Home's move-in modal show it.
 */
export default function ConnectorSetup({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // clipboard unavailable or refused: the address stays on screen to copy by hand
    }
  };

  return (
    <>
      <div className="connector-setup__url">
        <code>{url}</code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <ul className="connector-setup__steps">
        <li>Claude: Settings → Connectors → Add custom connector.</li>
        <li>ChatGPT: Settings → Apps → Advanced settings → Developer mode, then Create app.</li>
      </ul>
    </>
  );
}
