import React from 'react';
import { GitFork } from 'lucide-react';
import ProjectActionButton from './ProjectActionButton';

const AssignProjectsButton: React.FC = () => (
  <ProjectActionButton
    icon={GitFork}
    label="Assign"
    to="/app/assign-projects"
  />
);

export default AssignProjectsButton;
