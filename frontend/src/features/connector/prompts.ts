/** The move-in invitation's title and paragraph: the board's notice and the student Home's modal both say this. */
export const MOVE_IN_TITLE = 'Already running sprints somewhere else?';

export const MOVE_IN_BODY =
  "Your AI assistant can move your team's board in, finished work included. Tasks with an estimate count in your " +
  'burnup charts on the days they were done. It shows you the plan first and adds nothing until you say yes. Move in ' +
  "before your team adds more than 3 stories by hand, or finished work can't come across.";

/**
 * What a student pastes into an AI assistant to move the team's board in. The connector's own
 * instructions (backend `app/mcp/server.py`) hold the board's rules, so this says what to bring.
 */
export const MOVE_IN_PROMPT = `Move my team's scrum board into GrepThink, using the GrepThink connector.

Gather our sprints, stories and tasks from where we keep them now. If you can't read that yourself, ask me to paste or export it.

For each task, find its status (to do, in progress or done) and its estimate in points or hours. For finished work, find the day it was done. Ask me about anything the source doesn't say: the burnup counts only tasks with an estimate.

Keep each story's tasks under it, and make a card with no tasks one story with one task. Put each finished story in the sprint that holds the day it was done.

Show me the whole plan first, and add nothing until I say yes.`;
