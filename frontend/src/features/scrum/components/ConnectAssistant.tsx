import type { Ref } from 'react';
import { InfoPopover } from '@components/InfoPopover/InfoPopover';
import ConnectorSetup from '@features/connector/components/ConnectorSetup';
import './ConnectAssistant.scss';

/**
 * How to let an AI assistant fill this board (the MCP connector, backend `app/mcp`): the address to
 * add as a custom connector in Claude or ChatGPT. Team members only: staff cannot add to a board.
 * `ref` reaches the ⓘ that opens it.
 */
export default function ConnectAssistant({
  url,
  ref,
}: {
  url?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <InfoPopover
      ref={ref}
      title="Fill this board from your AI assistant"
      label="Connect an AI assistant"
      align="end"
      body={
        <div className="connect-assistant">
          <p>
            Add GrepThink as a custom connector, sign in, then paste your scrum doc or backlog into the chat and ask it
            to fill the board. It shows you the plan first and adds nothing until you say yes.
          </p>
          <ConnectorSetup url={url} />
        </div>
      }
    />
  );
}
