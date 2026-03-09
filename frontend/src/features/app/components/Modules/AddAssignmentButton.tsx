import React from 'react';
import { BookOpen } from 'lucide-react';
import './AddAssignmentButton.scss';

interface AddAssignmentButtonProps {
  onClick?: () => void;
}

const AddAssignmentButton: React.FC<AddAssignmentButtonProps> = ({ onClick }) => (
  <button className="add-assignment-btn" onClick={onClick}>
    <BookOpen size={16} />
    Add Assignment
  </button>
);

export default AddAssignmentButton;
