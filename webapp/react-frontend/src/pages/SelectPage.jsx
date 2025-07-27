import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SelectPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('student_id');
  const teacherId = params.get('teacher_id');
  const name = params.get('name');
  const [theme, setTheme] = useState('animals');
  const [level, setLevel] = useState('easy');
  if (!studentId) {
    navigate('/');
  }

  const start = () => {
    const bar = document.getElementById('load_bar');
    if (bar) bar.style.width = '0%';
    const ev = new EventSource(`/api/start_story?theme=${theme}&level=${level}`);
    const data = [];
    ev.addEventListener('progress', (e) => {
      if (bar) bar.style.width = parseFloat(e.data) * 100 + '%';
    });
    ev.addEventListener('sentence', (e) => {
      data.push({ type: 'sentence', ...JSON.parse(e.data) });
    });
    ev.addEventListener('direction', (e) => {
      data.push({ type: 'direction', ...JSON.parse(e.data) });
    });
    ev.addEventListener('complete', () => {
      ev.close();
      localStorage.setItem('story_data', JSON.stringify(data));
      localStorage.setItem('theme', theme);
      localStorage.setItem('level', level);
      const q = new URLSearchParams({ student_id: studentId, teacher_id: teacherId, name });
      navigate('/static/story.html?' + q.toString());
    });
  };

  return (
    <div>
      <div className="top-bar">
        <h1>Leesmaatje</h1>
        <span id="student_name">{name}</span>
        <button id="logout" className="accent" onClick={() => navigate('/')}>Uitloggen</button>
      </div>
      <div className="ui-pane">
        <label htmlFor="theme">Kies thema:</label>
        <select id="theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="animals">Dieren</option>
        </select>
        <label htmlFor="level">Kies niveau:</label>
        <select id="level" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="easy">Makkelijk</option>
        </select>
        <button id="start" className="primary" onClick={start}>Start</button>
        <div className="progress">
          <div id="load_bar" className="progress-bar"></div>
        </div>
      </div>
    </div>
  );
}
