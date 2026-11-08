import { useState, type Ref } from 'react';
import { InfoPopover } from '@components/InfoPopover/InfoPopover';
import { API_BASE_URL } from '@/lib/api/client';
import ConnectorSetup from '@features/connector/components/ConnectorSetup';
import MoveInPromptNote from '@features/connector/components/MoveInPromptNote';
import { connectorUrl } from '../utils/connectorUrl';
import './ConnectAssistant.scss';

/**
 * How to let an AI assistant fill this board (the MCP connector, backend `app/mcp`): the address to
 * add as a custom connector in Claude or ChatGPT, and the prompt for moving a board in. Team members
 * only: staff cannot add to a board. `ref` reaches the ⓘ that opens it.
 *
 * With `pulse`, the ⓘ fades in and out until it is clicked. Nothing remembers the click, so the next
 * board load pulses again.
 */
export default function ConnectAssistant({
  url = connectorUrl(API_BASE_URL, window.location.origin),
  pulse = false,
  ref,
}: {
  url?: string;
  pulse?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const [clicked, setClicked] = useState(false);

  return (
    // Capture, so a click that opens the popover (the ⓘ, or the notice's button clicking it) stops the pulse.
    <span
      className={pulse && !clicked ? 'connect-assistant-trigger connect-assistant-trigger--pulse' : 'connect-assistant-trigger'}
      onClickCapture={() => setClicked(true)}
    >
      <InfoPopover
        ref={ref}
        title="Fill this board from your AI assistant"
        label="Connect an AI assistant"
        align="end"
        body={
          <div className="connect-assistant">
            <p>
              Add GrepThink as a custom connector, sign in, then paste your scrum doc or backlog into the chat and ask
              it to fill the board. It shows you the plan first and adds nothing until you say yes.
            </p>
            <ConnectorSetup url={url} />
            <MoveInPromptNote />
          </div>
        }
      />
    </span>
  );
}
