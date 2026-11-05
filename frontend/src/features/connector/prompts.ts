/**
 * What a student pastes into an AI assistant to move the team's board in. The connector's own
 * instructions (backend `app/mcp/server.py`) hold the board's rules, so this says what to bring.
 */
export const MOVE_IN_PROMPT = `Move my team's scrum board into GrepThink, using the GrepThink connector.

Gather our sprints, stories and tasks from where we keep them now. If you can't read that yourself, ask me to paste or export it.

For each task, find its status (to do, in progress or done). For finished work, find the day it was done, and ask me when the source doesn't say.

Make each card one story with at least one task, so the burnup counts it. Put each finished story in the sprint that holds the day it was done.

Show me the whole plan first, and add nothing until I say yes.`;
