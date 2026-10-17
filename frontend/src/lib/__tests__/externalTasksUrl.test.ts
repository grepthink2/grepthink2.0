import { describe, expect, it } from 'vitest';
import { externalTasksHref, isExternalTasksUrlRefusal, parseExternalTasksUrl } from '../externalTasksUrl';
// One table with the API's tests (backend/tests/test_classes_external_tasks_url.py): what the box
// accepts the API accepts too, so a link that passes here never comes back as a 422.
import cases from './fixtures/external-tasks-url-cases.json';

/** Exactly the column's limit: "https://example.org/" is 20 characters. */
const LONGEST = `https://example.org/${'a'.repeat(2028)}`;

describe('parseExternalTasksUrl', () => {
  it.each([...cases.accepted, [LONGEST, LONGEST]])(
    'keeps the full address %j as typed, less surrounding spaces',
    (raw, url) => {
      expect(parseExternalTasksUrl(raw)).toEqual({ url });
    },
  );

  it.each(cases.blank)('reads the blank box %j as no link', (raw) => {
    expect(parseExternalTasksUrl(raw)).toEqual({ url: null });
  });

  it.each([...cases.refused, `${LONGEST}a`])('refuses %j, with a reason to show', (raw) => {
    expect(parseExternalTasksUrl(raw)).toEqual({ error: expect.stringMatching(/\S/) });
  });
});

describe('externalTasksHref', () => {
  it('opens a stored link as it is', () => {
    expect(externalTasksHref('https://job191.yeterly.ai/')).toBe('https://job191.yeterly.ai/');
  });

  // The API and the database refuse these; the sidebar still never turns one into a link.
  it.each([null, undefined, '', '  ', 'javascript:alert(1)', 'data:text/html,hi', 'example.org'])(
    'opens nothing for %j',
    (stored) => {
      expect(externalTasksHref(stored)).toBeNull();
    },
  );
});

describe('isExternalTasksUrlRefusal', () => {
  const refusal = (loc: unknown[]) => Object.assign(new Error('Request failed with status 422'), {
    status: 422,
    detail: [{ type: 'value_error', loc, msg: 'Value error, Enter a full link starting with https:// or http://' }],
  });

  it('recognizes the API refusing the link', () => {
    expect(isExternalTasksUrlRefusal(refusal(['body', 'external_tasks_url']))).toBe(true);
  });

  it.each([
    ['another field', refusal(['body', 'name'])],
    ['another status', Object.assign(new Error('Failed'), { status: 500, detail: 'Failed to create class' })],
    ['a plain error', new Error('Network down')],
    ['nothing', undefined],
  ])('does not mistake %s for it', (_, err) => {
    expect(isExternalTasksUrlRefusal(err)).toBe(false);
  });
});
