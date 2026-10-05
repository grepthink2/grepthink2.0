import { describe, expect, it } from 'vitest';
import { emailDomain, isSchoolEmail } from '../schoolEmail';

const SCHOOLS = [{ email_domains: ['ucsc.edu'] }, { email_domains: ['istinye.edu.tr'] }];

describe('isSchoolEmail (mirrors backend is_school_email)', () => {
  it.each([
    ['ann@ucsc.edu', true],
    ['Ann@UCSC.EDU', true],
    ['ann@gatech.edu', true],
    ['ann@istinye.edu.tr', true],
    ['ann@stu.istinye.edu.tr', true],
    ['ann@evil-istinye.edu.tr', false],
    ['ann@istinye.edu.tr.example.com', false],
    ['ann@gmail.com', false],
    ['not-an-email', false],
    ['', false],
  ])('%s → %s', (email, expected) => {
    expect(isSchoolEmail(email, SCHOOLS)).toBe(expected);
  });

  it('counts only .edu when no schools are known', () => {
    expect(isSchoolEmail('ann@ucsc.edu', [])).toBe(true);
    expect(isSchoolEmail('ann@istinye.edu.tr', [])).toBe(false);
    expect(isSchoolEmail(null, [])).toBe(false);
  });

  it('takes the domain after the last @', () => {
    expect(emailDomain(' Ann@Stu.Istinye.edu.tr ')).toBe('stu.istinye.edu.tr');
    expect(emailDomain('nobody')).toBe('');
  });
});
