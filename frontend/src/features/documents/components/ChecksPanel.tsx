import { useId } from 'react';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import type { DocumentCheck } from '../utils/checks';

interface ChecksPanelProps {
  checks: DocumentCheck[];
}

/**
 * What stands between the document and a hand-in: a list of the checks that fail, each with its
 * severity in words ("Blocks finalize", "Warning") and an icon, never by colour alone. The blocking
 * ones come first, in the order the API runs them; warnings never hold a finalize back.
 */
export default function ChecksPanel({ checks }: ChecksPanelProps) {
  const headingId = useId();
  const blocking = checks.filter((c) => c.severity === 'blocking').length;
  return (
    <section className="document-checks" aria-labelledby={headingId}>
      <h2 className="document-checks__title" id={headingId}>
        Checks{' '}
        <span className="document-checks__count">
          {checks.length === 0
            ? 'all pass'
            : `${blocking} blocking · ${checks.length - blocking} ${checks.length - blocking === 1 ? 'warning' : 'warnings'}`}
        </span>
      </h2>
      {checks.length === 0 ? (
        <p className="document-checks__ok">
          <CircleCheck size={15} aria-hidden="true" />
          Every check passes: the document can be handed in.
        </p>
      ) : (
        <ul className="document-checks__list">
          {checks.map((check) => {
            const blocks = check.severity === 'blocking';
            const Icon = blocks ? CircleAlert : TriangleAlert;
            return (
              <li
                key={`${check.severity}:${check.message}`}
                className={`document-checks__item document-checks__item--${check.severity}`}
              >
                <Icon size={15} aria-hidden="true" />
                <span>
                  <strong className="document-checks__severity">{blocks ? 'Blocks finalize:' : 'Warning:'}</strong>
                  {' '}
                  {check.message}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
