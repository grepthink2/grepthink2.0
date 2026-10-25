import { useState } from 'react';
import { Button } from '@components/Button/Button';
import { InfoPopover } from '@components/InfoPopover/InfoPopover';
import { API_BASE_URL } from '@/lib/api/client';
import { connectorUrl } from '../utils/connectorUrl';
import './ConnectAssistant.scss';

/**
 * How to let an AI assistant fill this board (the MCP connector, backend `app/mcp`): the address to
 * add as a custom connector in Claude or ChatGPT. Team members only: staff cannot add to a board.
 */
export default function ConnectAssistant({ url = connectorUrl(API_BASE_URL, window.location.origin) }: { url?: string }) {
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
    <InfoPopover
      title="Fill this board from your AI assistant"
      label="Connect an AI assistant"
      align="end"
      body={
        <div className="connect-assistant">
          <p>
            Add GrepThink as a custom connector, sign in, then paste your scrum doc or backlog into the chat and ask it
            to fill the board. It shows you the plan first and adds nothing until you say yes.
          </p>
          <div className="connect-assistant__url">
            <code>{url}</code>
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <ul className="connect-assistant__steps">
            <li>Claude: Settings → Connectors → Add custom connector.</li>
            <li>ChatGPT: Settings → Apps → Advanced settings → Developer mode, then Create app.</li>
          </ul>
        </div>
      }
    />
  );
}
