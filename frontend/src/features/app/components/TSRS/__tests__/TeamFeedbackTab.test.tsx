import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TeamFeedbackTab from '../TeamFeedbackTab';

describe('TeamFeedbackTab', () => {
  it('labels each teammate with their project role', () => {
    render(
      <TeamFeedbackTab
        members={[
          { id: 'u-ana', name: 'Ana Lopez', role: 'owner', isCurrentUser: true, isScrumMaster: false },
          { id: 'u-ben', name: 'Ben Okafor', role: 'scrum master', isCurrentUser: false, isScrumMaster: true },
          { id: 'u-cai', name: 'Cai Nguyen', role: 'admin', isCurrentUser: false, isScrumMaster: false },
        ]}
        feedback={{}}
        onFeedbackChange={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
        isFinalStep={false}
      />,
    );

    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Scrum Master')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});
