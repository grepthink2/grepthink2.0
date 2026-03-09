import React from 'react';
import { PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './AddProjectButton.scss';

interface AddProjectButtonProps {
  onClick?: () => void;
}

const AddProjectButton: React.FC<AddProjectButtonProps> = ({ onClick }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    navigate('/app/create-project');
  };

  return (
    <button className="add-assignment-btn projects__add-project-btn" onClick={handleClick}>
      <PlusCircle size={16} />
      Add Project
    </button>
  );
};

export default AddProjectButton;

