/** Section headers used in the project description template (single source of truth). */
export const SECTION_HEADERS = [
  '#### Problem Statement',
  '#### Project Goals',
  '#### Scope of Work',
  '#### Tech Stack',
] as const;

export interface TemplateFields {
  problemStatement: string;
  projectGoals: string;
  workingOn: string;
  techStack: string;
}

/** Generate template-style markdown from the four description fields. */
export function generateTemplateMarkdown(
  problemStatement: string,
  projectGoals: string,
  workingOn: string,
  techStack: string
): string {
  return `### Project Overview

A concise summary of the problem, goals, scope, and tools behind this project.

#### Problem Statement

${problemStatement.trim() || '{{what_are_you_solving}}'}


#### Project Goals

${projectGoals.trim() || '{{project_goals}}'}


#### Scope of Work

${workingOn.trim() || '{{what_you_are_working_on}}'}


#### Tech Stack

${techStack.trim() || '{{tech_stack}}'}


`;
}

/** Extract template fields from markdown that uses our template section headers. */
export function parseTemplateFromMarkdown(md: string): TemplateFields {
  const result: TemplateFields = {
    problemStatement: '',
    projectGoals: '',
    workingOn: '',
    techStack: '',
  };
  const keys: (keyof TemplateFields)[] = [
    'problemStatement',
    'projectGoals',
    'workingOn',
    'techStack',
  ];
  const remaining = md;
  for (let i = 0; i < SECTION_HEADERS.length; i++) {
    const header = SECTION_HEADERS[i];
    const key = keys[i];
    const startIdx = remaining.indexOf(header);
    if (startIdx === -1) continue;
    const contentStart = startIdx + header.length;
    const nextHeaderIdx =
      i < SECTION_HEADERS.length - 1
        ? remaining.indexOf(SECTION_HEADERS[i + 1], contentStart)
        : -1;
    const contentEnd = nextHeaderIdx === -1 ? remaining.length : nextHeaderIdx;
    let content = remaining.slice(contentStart, contentEnd).trim();
    content = content.replace(/\{\{[^}]+\}\}/g, '').trim();
    result[key] = content;
  }
  return result;
}
