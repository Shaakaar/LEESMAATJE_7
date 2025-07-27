import { useState, useEffect } from 'react';

export default function LoginPage() {
  const [tab, setTab] = useState('student');
  const [studentUser, setStudentUser] = useState('');
  const [studentPass, setStudentPass] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [practice, setPractice] = useState(false);
  const [teacherUser, setTeacherUser] = useState('');
  const [teacherPass, setTeacherPass] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // initialize models
    fetch('/api/initialize_models', { method: 'POST' }).catch(() => {});
  }, []);

  const loginStudent = async () => {
    const fd = new FormData();
    fd.append('username', studentUser);
    fd.append('password', studentPass);
    if (!practice && teacherId) fd.append('teacher_id', teacherId);
    setLoading(true);
    const r = await fetch('/api/login_student', { method: 'POST', body: fd });
    setLoading(false);
    if (r.ok) {
      const j = await r.json();
      const params = new URLSearchParams({
        student_id: j.student_id,
        name: studentUser,
      });
      if (j.teacher_id !== null) params.append('teacher_id', j.teacher_id);
      window.location.href = '/static/select.html?' + params.toString();
    } else {
      const j = await r.json();
      setMessage(j.detail || 'Login mislukt');
    }
  };

  const registerStudent = async () => {
    const fd = new FormData();
    fd.append('username', studentUser);
    fd.append('password', studentPass);
    if (teacherId) fd.append('teacher_id', teacherId);
    const r = await fetch('/api/register_student', { method: 'POST', body: fd });
    if (r.ok) setMessage('Leerling geregistreerd');
    else {
      const j = await r.json();
      setMessage(j.detail || 'Registratie mislukt');
    }
  };

  const loginTeacher = async () => {
    const fd = new FormData();
    fd.append('username', teacherUser);
    fd.append('password', teacherPass);
    setLoading(true);
    const r = await fetch('/api/login', { method: 'POST', body: fd });
    setLoading(false);
    if (r.ok) {
      const j = await r.json();
      const params = new URLSearchParams({ teacher_id: j.teacher_id });
      window.location.href = '/static/teacher.html?' + params.toString();
    } else {
      setMessage('Leraar inloggen mislukt');
    }
  };

  const registerTeacher = async () => {
    const fd = new FormData();
    fd.append('username', teacherUser);
    fd.append('password', teacherPass);
    const r = await fetch('/api/register', { method: 'POST', body: fd });
    if (r.ok) {
      const j = await r.json();
      setMessage('Leraar geregistreerd. ID: ' + j.teacher_id);
    } else {
      setMessage('Registratie leraar mislukt');
    }
  };

  return (
    <div>
      <header className="logo">
        <h1>Leesmaatje</h1>
      </header>
      <div className="login-card">
        <div className="tabs">
          <button
            id="show_student"
            className={tab === 'student' ? 'active' : ''}
            onClick={() => setTab('student')}
          >
            Leerling
          </button>
          <button
            id="show_teacher"
            className={tab === 'teacher' ? 'active' : ''}
            onClick={() => setTab('teacher')}
          >
            Leraar
          </button>
        </div>
        {tab === 'student' ? (
          <div className="login-pane">
            <input
              id="stu_user"
              placeholder="Gebruikersnaam"
              value={studentUser}
              onChange={(e) => setStudentUser(e.target.value)}
            />
            <input
              id="stu_pass"
              type="password"
              placeholder="Wachtwoord"
              value={studentPass}
              onChange={(e) => setStudentPass(e.target.value)}
            />
            <input
              id="stu_teacher"
              placeholder="Klascode"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            />
            <button id="stu_login" className="primary" onClick={loginStudent}>
              Inloggen
            </button>
            <button
              id="stu_practice"
              className={`accent toggle-btn ${practice ? 'active' : ''}`}
              onClick={() => setPractice(!practice)}
            >
              Oefenen zonder code
            </button>
            <button id="stu_register" className="accent" onClick={registerStudent}>
              Registreren
            </button>
          </div>
        ) : (
          <div className="login-pane">
            <input
              id="teach_user"
              placeholder="Gebruikersnaam"
              value={teacherUser}
              onChange={(e) => setTeacherUser(e.target.value)}
            />
            <input
              id="teach_pass"
              type="password"
              placeholder="Wachtwoord"
              value={teacherPass}
              onChange={(e) => setTeacherPass(e.target.value)}
            />
            <button id="teach_login" className="primary" onClick={loginTeacher}>
              Inloggen
            </button>
            <button id="teach_register" className="accent" onClick={registerTeacher}>
              Registreren
            </button>
          </div>
        )}
        {message && (
          <div id="message" className="error">
            {message}
          </div>
        )}
        {loading && (
          <div id="loading_overlay" className="loading-overlay">
            <span className="spinner"></span>
            <span>Laden...</span>
          </div>
        )}
      </div>
    </div>
  );
}
