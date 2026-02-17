import React, { useEffect, useState } from 'react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import './Dashboard.scss';

interface ClassDetails {
  id: string;
  name: string;
  description?: string;
  course_code?: string;
  created_by: string;
  created_at: string;
}

const Dashboard: React.FC = () => {
  const { selectedClass } = useClass();
  const [classDetails, setClassDetails] = useState<ClassDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedClass) {
      fetchClassDetails();
    } else {
      setClassDetails(null);
    }
  }, [selectedClass]);

  const fetchClassDetails = async () => {
    if (!selectedClass) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.getClass(selectedClass.id);
      setClassDetails(response.class);
    } catch (err) {
      console.error('Failed to fetch class details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch class details');
    } finally {
      setLoading(false);
    }
  };

  if (!selectedClass) {
    return (
      <div className="dashboard">
        <div className="dashboard__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view the dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard__loading">Loading class details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard__error">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={fetchClassDetails}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1>{classDetails?.name}</h1>
        <div className="dashboard__header-info">
          <span className="dashboard__course-code">
            Course Code: {classDetails?.course_code}
          </span>
          {classDetails?.description && (
            <span className="dashboard__description">{classDetails.description}</span>
          )}
        </div>
      </div>

      <div className="dashboard__content">
        <div className="dashboard__stats">
          <div className="stat-card">
            <h3>Class Information</h3>
            <div className="stat-card__content">
              <div className="stat-item">
                <span className="stat-label">Course Code:</span>
                <span className="stat-value">{classDetails?.course_code}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Created:</span>
                <span className="stat-value">
                  {classDetails?.created_at
                    ? new Date(classDetails.created_at).toLocaleDateString()
                    : 'N/A'}
                </span>
              </div>
              {classDetails?.description && (
                <div className="stat-item">
                  <span className="stat-label">Term:</span>
                  <span className="stat-value">{classDetails.description}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
