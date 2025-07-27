import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function TeacherPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const teacherId = parseInt(params.get('teacher_id'), 10);

  const [students, setStudents] = useState([]);

  useEffect(() => {
    if (isNaN(teacherId)) {
      navigate('/');
      return;
    }
    fetch('/api/student_summaries/' + teacherId)
      .then((r) => r.json())
      .then(setStudents);
  }, [teacherId]);

  return (
    <div>
      <div className="top-bar">
        <h1>Leesmaatje</h1>
        <span id="class_code">{teacherId}</span>
        <button id="logout" className="accent" onClick={() => navigate('/')}>Uitloggen</button>
      </div>
      <div className="ui-pane">
        <h2>Klasresultaten</h2>
        <table id="students" className="results-table">
          <thead>
            <tr><th>Naam</th><th>Laatste zin</th><th>Minuten (7d)</th></tr>
          </thead>
          <tbody>
            {students.map((stu) => (
              <tr key={stu.id}>
                <td>
                  <Link to={`/static/student_results.html?student_id=${stu.id}&teacher_id=${teacherId}&name=${stu.username}`}>{stu.username}</Link>
                </td>
                <td>{stu.last_sentence ? new Date(stu.last_sentence * 1000).toLocaleString() : '-'}</td>
                <td>{stu.minutes_7d.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
