import React, { useEffect, useState } from 'react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import { User, Mail, Shield } from 'lucide-react';
import './Roster.scss';

interface Student {
  id: string;
  email: string;
  role: string;
}

const Roster: React.FC = () => {
  const { selectedClass } = useClass();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
    } else {
      setStudents([]);
    }
  }, [selectedClass]);

  const fetchStudents = async () => {
    if (!selectedClass) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.getClassStudents(selectedClass.id);
      setStudents(response.students);
    } catch (err) {
      console.error('Failed to fetch students:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter((student) =>
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!selectedClass) {
    return (
      <div className="roster">
        <div className="roster__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view the roster.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="roster">
        <div className="roster__loading">Loading students...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="roster">
        <div className="roster__error">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={fetchStudents}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="roster">
      <div className="roster__header">
        <div className="roster__header-left">
          <h1>Class Roster</h1>
          <p className="roster__class-name">{selectedClass.name}</p>
        </div>
        <div className="roster__header-right">
          <span className="roster__count">
            {students.length} {students.length === 1 ? 'Student' : 'Students'}
          </span>
        </div>
      </div>

      <div className="roster__controls">
        <div className="roster__search">
          <input
            type="text"
            placeholder="Search by email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="roster__search-input"
          />
        </div>
      </div>

      <div className="roster__content">
        {filteredStudents.length === 0 ? (
          <div className="roster__empty-state">
            {searchQuery ? (
              <p>No students found matching "{searchQuery}"</p>
            ) : (
              <p>No students enrolled in this class yet.</p>
            )}
          </div>
        ) : (
          <div className="roster__table">
            <div className="roster__table-header">
              <div className="roster__table-cell roster__table-cell--icon"></div>
              <div className="roster__table-cell roster__table-cell--email">Email</div>
              <div className="roster__table-cell roster__table-cell--role">Role</div>
            </div>
            {filteredStudents.map((student) => (
              <div key={student.id} className="roster__table-row">
                <div className="roster__table-cell roster__table-cell--icon">
                  <div className="roster__user-avatar">
                    <User size={16} />
                  </div>
                </div>
                <div className="roster__table-cell roster__table-cell--email">
                  <div className="roster__user-email">
                    <Mail size={14} />
                    <span>{student.email}</span>
                  </div>
                </div>
                <div className="roster__table-cell roster__table-cell--role">
                  <div className="roster__role-badge">
                    <Shield size={14} />
                    <span>{student.role || 'Student'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Roster;
