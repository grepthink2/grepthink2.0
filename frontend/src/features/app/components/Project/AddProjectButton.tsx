import React from 'react';
import { PlusCircle } from 'lucide-react';
import ProjectActionButton from './ProjectActionButton';

interface AddProjectButtonProps {
  onClick?: () => void;
}

const AddProjectButton: React.FC<AddProjectButtonProps> = ({ onClick }) => (
  <ProjectActionButton
    icon={PlusCircle}
    label="Add Project"
    to="/app/create-project"
    onClick={onClick}
  />
);

export default AddProjectButton;
