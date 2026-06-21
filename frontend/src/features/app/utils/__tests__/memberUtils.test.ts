import { emailToDisplayName, getInitials, getMemberCopyEmail } from '../memberUtils';

describe('emailToDisplayName', () => {
  it('falls back to "Unknown" when email is missing', () => {
    expect(emailToDisplayName(undefined)).toBe('Unknown');
  });

  it('title-cases the local part, splitting on dots and underscores', () => {
    expect(emailToDisplayName('ada.lovelace@ucsc.edu')).toBe('Ada Lovelace');
    expect(emailToDisplayName('grace_hopper@navy.mil')).toBe('Grace Hopper');
  });

  it('handles a single-token local part', () => {
    expect(emailToDisplayName('turing@kingscollege.ac.uk')).toBe('Turing');
  });
});

describe('getInitials', () => {
  it('uses first + last initial for multi-word names', () => {
    expect(getInitials('Ada Lovelace', 'ada@x.com')).toBe('AL');
  });

  it('uses the first two letters for a single-word name', () => {
    expect(getInitials('Ada', 'ada@x.com')).toBe('AD');
  });

  it('falls back to the email when the name is missing or "Unknown"', () => {
    expect(getInitials('Unknown', 'bob@x.com')).toBe('BO');
    expect(getInitials('', 'cy@x.com')).toBe('CY');
  });

  it('returns "?" when there is no name and no email', () => {
    expect(getInitials('', '')).toBe('?');
  });
});

describe('getMemberCopyEmail', () => {
  it('prefers the verified .edu email', () => {
    expect(getMemberCopyEmail({ edu_email: 'a@ucsc.edu', email: 'a@gmail.com' })).toBe('a@ucsc.edu');
  });

  it('falls back to the primary email when no edu email', () => {
    expect(getMemberCopyEmail({ edu_email: null, email: 'a@gmail.com' })).toBe('a@gmail.com');
  });

  it('returns null when neither is present', () => {
    expect(getMemberCopyEmail({ edu_email: '  ', email: null })).toBeNull();
  });
});
