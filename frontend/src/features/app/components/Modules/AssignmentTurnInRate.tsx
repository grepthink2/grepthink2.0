import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import './AssignmentTurnInRate.scss';

export interface TurnInRateData {
  rate: number;
  teamsSubmitted: { count: number; total: number };
  partialSubmissions: { count: number; total: number };
  currentAssignment: string;
  dueDate: string;
}

interface AssignmentTurnInRateProps {
  data: TurnInRateData;
}

const AssignmentTurnInRate: React.FC<AssignmentTurnInRateProps> = ({ data }) => {
  const submittedPct = Math.round((data.teamsSubmitted.count / data.teamsSubmitted.total) * 100);
  const partialPct = Math.round((data.partialSubmissions.count / data.partialSubmissions.total) * 100);

  return (
    <div className="turn-in-card">
      <h3 className="turn-in-card__heading">Assignment Turn-In Rate</h3>

      <div className="turn-in-card__percentage">{data.rate}%</div>

      <div className="turn-in-card__items">
        <div className="turn-in-item">
          <div className="turn-in-item__label">
            <CheckCircle2 size={15} className="turn-in-item__icon turn-in-item__icon--green" />
            <span>Teams Submitted</span>
          </div>
          <span className="turn-in-item__count">
            {data.teamsSubmitted.count}/{data.teamsSubmitted.total}
          </span>
        </div>
        <div className="turn-in-bar turn-in-bar--green">
          <div className="turn-in-bar__fill" style={{ width: `${submittedPct}%` }} />
        </div>

        <div className="turn-in-item turn-in-item--spaced">
          <div className="turn-in-item__label">
            <Clock size={15} className="turn-in-item__icon turn-in-item__icon--orange" />
            <span>Partial Submissions</span>
          </div>
          <span className="turn-in-item__count">
            {data.partialSubmissions.count}/{data.partialSubmissions.total}
          </span>
        </div>
        <div className="turn-in-bar turn-in-bar--orange">
          <div className="turn-in-bar__fill" style={{ width: `${partialPct}%` }} />
        </div>
      </div>

      <div className="turn-in-card__divider" />

      <div className="turn-in-card__current">
        <p>
          Current Assignment: <strong>{data.currentAssignment}</strong>
        </p>
        <p>Due: {data.dueDate}</p>
      </div>
    </div>
  );
};

export default AssignmentTurnInRate;
