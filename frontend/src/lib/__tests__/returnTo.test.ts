import { beforeEach, describe, expect, it } from 'vitest';
import { rememberReturnTo, takeReturnTo } from '../returnTo';

beforeEach(() => sessionStorage.clear());

describe('returnTo', () => {
  it('gives back a remembered consent page once', () => {
    rememberReturnTo('/oauth/consent?authorization_id=abc');

    expect(takeReturnTo()).toBe('/oauth/consent?authorization_id=abc');
    expect(takeReturnTo()).toBeNull();
  });

  it.each([
    'https://evil.example/oauth/consent?x=1',
    '//evil.example/oauth/consent',
    '/app/home',
    '/oauth/consentx',
  ])('ignores %s', (path) => {
    rememberReturnTo(path);

    expect(takeReturnTo()).toBeNull();
  });

  it('ignores a value written by something else', () => {
    sessionStorage.setItem('gt:returnTo', 'javascript:alert(1)');

    expect(takeReturnTo()).toBeNull();
  });
});
