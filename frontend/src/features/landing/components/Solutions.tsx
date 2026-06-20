import React from 'react';
import { Users, ClipboardList, ListChecks } from 'lucide-react';
import previewSvg from '@assets/preview.svg';
import './Solutions.scss';

const FEATURES = [
  {
    icon: Users,
    title: 'Smart team formation',
    description:
      'Balance teams by interests and skills, so no group is stacked and no student is stranded.',
  },
  {
    icon: ListChecks,
    title: 'Rosters & assignments',
    description:
      'Manage enrollment, projects, and coursework from one place, no more juggling spreadsheets.',
  },
  {
    icon: ClipboardList,
    title: 'Weekly status reports',
    description:
      'Students log progress each week with TSRs; instructors see exactly who is on track at a glance.',
  },
];

const Solutions: React.FC = () => {
  return (
    <section className="solutions" id="solutions">
      <div className="solutions__inner">
        <h2 className="solutions__heading">Everything your class needs</h2>
        <p className="solutions__sub">
          From the first roster to the final demo, grepthink keeps team projects
          organized and accountable.
        </p>

        <div className="solutions__columns">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="feature-col">
              <span className="feature-col__icon">
                <Icon size={20} strokeWidth={2} />
              </span>
              <h3 className="feature-col__title">{title}</h3>
              <p className="feature-col__desc">{description}</p>
            </div>
          ))}
        </div>

        <div className="solutions__preview">
          <div className="preview-window">
            <div className="preview-window__chrome">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-window__body">
              <img src={previewSvg} alt="grepthink app preview" className="preview-window__img" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Solutions;
