import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ProjectActionButton.scss';

interface ProjectActionButtonProps {
  icon: LucideIcon;
  label: string;
  to?: string;
  onClick?: () => void;
}

const ProjectActionButton: React.FC<ProjectActionButtonProps> = ({
  icon: Icon,
  label,
  to,
  onClick,
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (to) {
      navigate(to);
    }
  };

  return (
    <button className="add-assignment-btn project-action-btn" onClick={handleClick}>
      <Icon size={16} />
      {label}
    </button>
  );
};

export default ProjectActionButton;
