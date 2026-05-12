import React from 'react';
import Profile from './Blocks/Profile';
import Portfolio from './Blocks/Portfolio';
import './StudentSettings.scss';

const StudentSettings: React.FC = () => (
  <div className="student-settings">
    <Profile />
    <Portfolio />
  </div>
);

export default StudentSettings;
