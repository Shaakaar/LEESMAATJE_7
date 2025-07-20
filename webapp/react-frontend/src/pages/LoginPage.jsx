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
    <div className="p-4 max-w-md mx-auto">
      <header className="text-center mb-4">
        <h1 className="text-2xl font-bold">Leesmaatje</h1>
      </header>
      <div className="flex mb-4">
        <button
          className={`flex-1 p-2 border ${tab === 'student' ? 'bg-blue-300' : ''}`}
          onClick={() => setTab('student')}
        >
          Leerling
        </button>
        <button
          className={`flex-1 p-2 border ${tab === 'teacher' ? 'bg-blue-300' : ''}`}
          onClick={() => setTab('teacher')}
        >
          Leraar
        </button>
      </div>
      {tab === 'student' ? (
        <div className="space-y-2">
          <input
            className="w-full p-2 border"
            placeholder="Gebruikersnaam"
            value={studentUser}
            onChange={(e) => setStudentUser(e.target.value)}
          />
          <input
            className="w-full p-2 border"
            type="password"
            placeholder="Wachtwoord"
            value={studentPass}
            onChange={(e) => setStudentPass(e.target.value)}
          />
          <input
            className="w-full p-2 border"
            placeholder="Klascode"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          />
          <button className="w-full bg-blue-500 text-white p-2" onClick={loginStudent}>
            Inloggen
          </button>
          <button
            className={`w-full p-2 border ${practice ? 'bg-green-200' : ''}`}
            onClick={() => setPractice(!practice)}
          >
            Oefenen zonder code
          </button>
          <button className="w-full p-2 border" onClick={registerStudent}>
            Registreren
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className="w-full p-2 border"
            placeholder="Gebruikersnaam"
            value={teacherUser}
            onChange={(e) => setTeacherUser(e.target.value)}
          />
          <input
            className="w-full p-2 border"
            type="password"
            placeholder="Wachtwoord"
            value={teacherPass}
            onChange={(e) => setTeacherPass(e.target.value)}
          />
          <button className="w-full bg-blue-500 text-white p-2" onClick={loginTeacher}>
            Inloggen
          </button>
          <button className="w-full p-2 border" onClick={registerTeacher}>
            Registreren
          </button>
        </div>
      )}
      {message && <div className="mt-4 text-red-600">{message}</div>}
      {loading && <div className="mt-4">Laden...</div>}
    </div>
  );
}
