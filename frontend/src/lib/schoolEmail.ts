/**
 * What counts as a school email. Mirrors `is_school_email` in
 * backend/app/institutions/controller.py — keep the two in sync.
 */
import type { ApiInstitution } from './api';

/** The lower-cased part after the last `@`, or '' when there is none. */
export function emailDomain(email: string | null | undefined): string {
  const address = (email ?? '').trim().toLowerCase();
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1) : '';
}

/**
 * True when the domain ends in `.edu`, or is one of a school's `email_domains`, or a subdomain of
 * one (`stu.istinye.edu.tr` matches `istinye.edu.tr`; `evil-istinye.edu.tr` does not).
 */
export function isSchoolEmail(
  email: string | null | undefined,
  institutions: readonly Pick<ApiInstitution, 'email_domains'>[],
): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (domain.endsWith('.edu')) return true;
  return institutions.some((institution) =>
    institution.email_domains.some((raw) => {
      const allowed = raw.trim().toLowerCase();
      return allowed !== '' && (domain === allowed || domain.endsWith(`.${allowed}`));
    }),
  );
}
