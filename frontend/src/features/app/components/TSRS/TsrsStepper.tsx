import React from 'react';
import { BarChart2, MessageSquare, Shield, Check } from 'lucide-react';
import type { TsrsTab } from './tsrsTypes';
import './TsrsStepper.scss';

interface Step {
  id: TsrsTab;
  label: string;
  icon: React.ReactNode;
}

interface TsrsStepperProps {
  activeTab: TsrsTab;
  completedSteps: Set<TsrsTab>;
  onTabClick: (tab: TsrsTab) => void;
  showScrumMaster: boolean;
}

const ALL_STEPS: Step[] = [
  { id: 'contributions',  label: 'Contributions',  icon: <BarChart2 size={24} /> },
  { id: 'team_feedback',  label: 'Team Feedback',  icon: <MessageSquare size={24} /> },
  { id: 'scrum_master',   label: 'Scrum Master',   icon: <Shield size={24} /> },
];

const TsrsStepper: React.FC<TsrsStepperProps> = ({ activeTab, completedSteps, onTabClick, showScrumMaster }) => {
  const steps = showScrumMaster ? ALL_STEPS : ALL_STEPS.slice(0, 2);

  return (
    <div className="tsrs-stepper">
      {steps.map((step, index) => {
        const isActive = activeTab === step.id;
        const isCompleted = completedSteps.has(step.id) && activeTab !== step.id;
        const isConnectorComplete = index > 0 && completedSteps.has(steps[index - 1].id);
        return (
          <React.Fragment key={step.id}>
            {index > 0 && (
              <div
                className={`tsrs-stepper__connector${isConnectorComplete ? ' tsrs-stepper__connector--complete' : ''}`}
              />
            )}
            <button
              type="button"
              className={`tsrs-stepper__step${isActive ? ' tsrs-stepper__step--active' : ''}${isCompleted ? ' tsrs-stepper__step--completed' : ''}`}
              onClick={() => onTabClick(step.id)}
            >
              <div
                className={`tsrs-stepper__icon-circle${isActive ? ' tsrs-stepper__icon-circle--active' : ''}${isCompleted ? ' tsrs-stepper__icon-circle--completed' : ''}`}
              >
                {isCompleted ? <Check size={24} /> : step.icon}
              </div>
              <span className="tsrs-stepper__label">{step.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default TsrsStepper;
