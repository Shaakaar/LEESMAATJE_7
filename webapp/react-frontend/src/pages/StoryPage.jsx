import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function StoryPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('student_id');
  const _teacherId = params.get('teacher_id');
  const name = params.get('name');
  const [data, _setData] = useState(() => JSON.parse(localStorage.getItem('story_data') || '[]'));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!studentId || !data.length) {
      navigate('/');
    }
  }, [studentId, data]);

  const item = data[index];

  const next = () => setIndex((i) => (i + 1) % data.length);
  const prev = () => setIndex((i) => (i - 1 + data.length) % data.length);

  if (!item) return null;

  return (
    <div>
      <div className="top-bar">
        <h1>Leesmaatje</h1>
        <span>{name}</span>
        <button id="logout" className="accent" onClick={() => navigate('/')}>Uitloggen</button>
      </div>
      <div className="ui-pane">
        <label htmlFor="sentence" className="sentence-label">Zin om te lezen:</label>
        <div id="sentence" className="card">
          {item.text}
          {item.audio && (
            <button className="ml-2" onClick={() => new Audio('/api/audio/' + item.audio).play()}>▶</button>
          )}
        </div>
        <div className="progress">
          <div id="progress_bar" className="progress-bar" style={{ width: ((index + 1) / data.length) * 100 + '%' }}></div>
        </div>
        <div className="progress-text">
          {index + 1}/{data.length}
        </div>
        <div className="nav-row">
          <button id="prevBtn" className="nav-btn" onClick={prev} disabled={data.length <= 1}>Vorige</button>
          <button id="nextBtn" className="nav-btn" onClick={next}>Volgende</button>
        </div>
      </div>
    </div>
  );
}
