import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@features/app/components/Sidebar';
import './AppView.scss';

const AppView: React.FC = () => {
  // TODO: Get role from auth context/token when implemented
  const role = 'student'; // Temporary hardcode, will be replaced with actual role from auth

  return (
    <div className="app-view">
      <Sidebar role={role} />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

export default AppView;
