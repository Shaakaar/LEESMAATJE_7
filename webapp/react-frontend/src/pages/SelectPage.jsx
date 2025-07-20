import { useEffect, useState } from 'react';

export default function SelectPage() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('student_id');
  const teacherId = params.get('teacher_id');
  const name = params.get('name');
  const [theme, setTheme] = useState('animals');
  const [level, setLevel] = useState('easy');
  if (!studentId) {
    window.location.href = '/';
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
      window.location.href = '/static/story.html?' + q.toString();
    });
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-2">
      <h2 className="text-xl mb-2">Welkom {name}</h2>
      <div>
        <label className="block mb-1">Thema</label>
        <select className="w-full p-2 border" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="animals">Dieren</option>
        </select>
      </div>
      <div>
        <label className="block mb-1">Niveau</label>
        <select className="w-full p-2 border" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="easy">Makkelijk</option>
        </select>
      </div>
      <div className="h-2 bg-gray-200 rounded">
        <div id="load_bar" className="h-full bg-blue-500" style={{ width: '0%' }}></div>
      </div>
      <button className="w-full bg-blue-500 text-white p-2" onClick={start}>Start</button>
    </div>
  );
}
