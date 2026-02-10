import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import './ClassManagement.scss';

interface Class {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  teacher_email?: string;
}

interface Student {
  id: string;
  email: string;
  user_id: string;
  role: string;
}

const ClassManagement: React.FC = () => {
  const { getToken } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Form states
  const [className, setClassName] = useState('');
  const [classDescription, setClassDescription] = useState('');
  const [studentEmail, setStudentEmail] = useState('');

  // Success messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    checkUserRole();
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents(selectedClass.id);
    }
  }, [selectedClass]);

  const getAccessToken = async () => {
    const token = await getToken();
    if (!token) {
      throw new Error('Authentication required');
    }
    return token;
  };

  const checkUserRole = async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch('http://localhost:5001/api/login-check', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setUserRole(data.role);
    } catch (err) {
      console.error('Error checking user role:', err);
    }
  };

  const fetchClasses = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch('http://localhost:5001/api/classes', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch classes');
      }

      const data = await response.json();
      setClasses(data.classes || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = await getAccessToken();
      const response = await fetch('http://localhost:5001/api/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: className,
          description: classDescription,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create class');
      }

      await response.json();
      setSuccessMessage('Class created successfully!');
      setClassName('');
      setClassDescription('');
      fetchClasses();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inviteStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `http://localhost:5001/api/classes/${selectedClass.id}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            student_email: studentEmail,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to invite student');
      }

      const data = await response.json();
      setSuccessMessage(data.message);
      setStudentEmail('');
      fetchStudents(selectedClass.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async (classId: string) => {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `http://localhost:5001/api/classes/${classId}/students`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch students');
      }

      const data = await response.json();
      setStudents(data.students || []);
    } catch (err: any) {
      console.error('Error fetching students:', err);
    }
  };

  const selectClass = (cls: Class) => {
    setSelectedClass(cls);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="class-management">
      <h1>Class Management</h1>
      <p className="user-role">Role: {userRole || 'Loading...'}</p>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <div className="class-management-container">
        {/* Left Panel - Create Class and List */}
        <div className="left-panel">
          {userRole === 'teacher' && (
            <div className="create-class-section">
              <h2>Create New Class</h2>
              <form onSubmit={createClass}>
                <div className="form-group">
                  <label htmlFor="className">Class Name</label>
                  <input
                    type="text"
                    id="className"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    required
                    placeholder="e.g., Introduction to Programming"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="classDescription">Description</label>
                  <textarea
                    id="classDescription"
                    value={classDescription}
                    onChange={(e) => setClassDescription(e.target.value)}
                    placeholder="Class description (optional)"
                    rows={3}
                  />
                </div>
                <button type="submit" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Class'}
                </button>
              </form>
            </div>
          )}

          <div className="classes-list-section">
            <h2>My Classes</h2>
            {loading && <p>Loading classes...</p>}
            {classes.length === 0 && !loading && (
              <p className="no-classes">No classes found.</p>
            )}
            <div className="classes-list">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className={`class-card ${selectedClass?.id === cls.id ? 'selected' : ''}`}
                  onClick={() => selectClass(cls)}
                >
                  <h3>{cls.name}</h3>
                  <p>{cls.description || 'No description'}</p>
                  {userRole !== 'teacher' && userRole !== 'instructor' && cls.teacher_email && (
                    <p className="teacher-email">Teacher: {cls.teacher_email}</p>
                  )}
                  <small>Created: {new Date(cls.created_at).toLocaleDateString()}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Class Details and Invite Students */}
        <div className="right-panel">
          {selectedClass ? (
            <>
              <div className="class-details">
                <h2>{selectedClass.name}</h2>
                <p>{selectedClass.description || 'No description'}</p>
                {userRole !== 'teacher' && userRole !== 'instructor' && selectedClass.teacher_email && (
                  <p className="teacher-email">Teacher: {selectedClass.teacher_email}</p>
                )}
              </div>

              {userRole === 'teacher' && (
                <div className="invite-section">
                  <h3>Invite Students</h3>
                  <form onSubmit={inviteStudent}>
                    <div className="form-group">
                      <label htmlFor="studentEmail">Student Email</label>
                      <input
                        type="email"
                        id="studentEmail"
                        value={studentEmail}
                        onChange={(e) => setStudentEmail(e.target.value)}
                        required
                        placeholder="student@example.com"
                      />
                    </div>
                    <button type="submit" disabled={loading}>
                      {loading ? 'Inviting...' : 'Invite Student'}
                    </button>
                  </form>
                </div>
              )}

              <div className="students-section">
                <h3>Enrolled Students ({students.length})</h3>
                {students.length === 0 ? (
                  <p className="no-students">No students enrolled yet.</p>
                ) : (
                  <div className="students-list">
                    {students.map((student) => (
                      <div key={student.id} className="student-card">
                        <p className="student-email">{student.email}</p>
                        <small>User ID: {student.user_id}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="no-selection">
              <p>Select a class to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassManagement;
