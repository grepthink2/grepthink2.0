import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSafeExternalUrl } from '../leaveSite';

afterEach(() => vi.restoreAllMocks());

describe('isSafeExternalUrl', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback?code=1',
    'http://localhost:6274/oauth/callback?code=1',
    'cursor://anysphere.cursor-retrieval/oauth/callback?code=1',
  ])('lets the browser go to %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(true);
  });

  it.each([
    "javascript:fetch('//evil.example')//?error=access_denied",
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });
});
