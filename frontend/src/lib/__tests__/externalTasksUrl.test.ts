import { describe, expect, it } from 'vitest';
import { externalTasksHref, parseExternalTasksUrl } from '../externalTasksUrl';

// The same table as the API's (backend/tests/test_classes_external_tasks_url.py): what the box
// accepts the API accepts too, so a link that passes here never comes back as a 422.

/** Exactly the column's limit: "https://example.org/" is 20 characters. */
const LONGEST = `https://example.org/${'a'.repeat(2028)}`;

describe('parseExternalTasksUrl', () => {
  it.each([
    ['https://job191.yeterly.ai/', 'https://job191.yeterly.ai/'],
    ['https://tasks.grepthink2.com/cse115a', 'https://tasks.grepthink2.com/cse115a'],
    ['http://example.org/board?sprint=2#todo', 'http://example.org/board?sprint=2#todo'],
    ['HTTPS://Example.org', 'HTTPS://Example.org'],
    ['https://example.org:8443/x', 'https://example.org:8443/x'],
    ['  https://example.org  ', 'https://example.org'],
    [LONGEST, LONGEST],
  ])('keeps the full address %j as typed, less surrounding spaces', (raw, url) => {
    expect(parseExternalTasksUrl(raw)).toEqual({ url });
  });

  it.each(['', '   '])('reads the blank box %j as no link', (raw) => {
    expect(parseExternalTasksUrl(raw)).toEqual({ url: null });
  });

  it.each([
    'javascript:alert(1)',
    'javascript://example.org/%0aalert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.org/tasks',
    'mailto:ta@example.org',
    'example.org/tasks',
    '//example.org/tasks',
    'https://',
    'https:///example.org',
    'https:example.org',
    'https://exa mple.org',
    'https://example.org/my tasks',
    'https://example.org/\ttasks',
    'https://example.org/​tasks',
    'https://example.org:99999',
    'https://example.org:abc',
    'https://[::1',
    `${LONGEST}a`,
  ])('refuses %j, with a reason to show', (raw) => {
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
