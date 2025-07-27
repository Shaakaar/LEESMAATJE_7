import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function StoryPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('student_id');
  const _teacherId = params.get('teacher_id');
  const name = params.get('name');
  const [data] = useState(() =>
    JSON.parse(localStorage.getItem('story_data') || '[]'),
  );
  const [index, setIndex] = useState(0);
  const [selectedDirection, setSelectedDirection] = useState(null);

  useEffect(() => {
    if (!studentId || !data.length) {
      navigate('/');
    }
  }, [studentId, data]);

  const item = data[index];

  const next = () => {
    const item = data[index];
    if (item && item.type === 'direction') {
      if (selectedDirection === null) return;
      setSelectedDirection(null);
      setIndex((i) => Math.min(i + 2, data.length - 1));
    } else {
      setIndex((i) => i + 1);
    }
  };

  const prev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  if (!item) return null;

  const isDirection =
    item.type === 'direction' &&
    data[index + 1] &&
    data[index + 1].type === 'direction';

  let progressIndex = index + 1;
  if (isDirection) progressIndex += 1;

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
          {isDirection ? (
            <div className="directions">
              {[item, data[index + 1]].map((opt, i) => (
                <label key={i} className="direction-option">
                  <input
                    type="radio"
                    name="direction"
                    value={i}
                    onChange={() => setSelectedDirection(i)}
                  />
                  <span>{opt.text}</span>
                  <button
                    className="play-sent"
                    onClick={() => new Audio('/api/audio/' + opt.audio).play()}
                  >
                    <i className="lucide lucide-volume-2"></i>
                  </button>
                </label>
              ))}
            </div>
          ) : (
            <p>
              {item.text.split(' ').map((w, i) => {
                const audio = item.words ? item.words[i] : null;
                return (
                  <span
                    key={i}
                    className="word"
                    onClick={() => audio && new Audio('/api/audio/' + audio).play()}
                  >
                    {w + ' '}
                  </span>
                );
              })}
              {item.audio && (
                <button
                  className="play-sent"
                  onClick={() => new Audio('/api/audio/' + item.audio).play()}
                >
                  <i className="lucide lucide-volume-2"></i>
                </button>
              )}
            </p>
          )}
        </div>
        <div className="progress">
          <div
            id="progress_bar"
            className="progress-bar"
            style={{ width: (progressIndex / data.length) * 100 + '%' }}
          ></div>
        </div>
        <div className="progress-text">
          {progressIndex}/{data.length}
        </div>
        <div className="nav-row">
          <button
            id="prevBtn"
            className="nav-btn"
            onClick={prev}
            disabled={index === 0}
          >
            <i className="lucide lucide-chevrons-left"></i>
            <span className="label">Vorige</span>
          </button>
          <button
            id="nextBtn"
            className="nav-btn"
            onClick={next}
            disabled={isDirection ? selectedDirection === null : index === data.length - 1}
          >
            <span className="label">Volgende</span>
            <i className="lucide lucide-chevrons-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
