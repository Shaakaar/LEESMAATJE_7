import { useEffect, useState } from 'react';

export default function StoryPage() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('student_id');
  const teacherId = params.get('teacher_id');
  const name = params.get('name');
  const [data, setData] = useState(() => JSON.parse(localStorage.getItem('story_data') || '[]'));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!studentId || !data.length) {
      window.location.href = '/';
    }
  }, [studentId, data]);

  const item = data[index];

  const next = () => setIndex((i) => (i + 1) % data.length);
  const prev = () => setIndex((i) => (i - 1 + data.length) % data.length);

  if (!item) return null;

  return (
    <div className="p-4 max-w-xl mx-auto">
      <div className="mb-2">{name}</div>
      <div className="border p-4 rounded mb-2">
        {item.text}
        {item.audio && (
          <button className="ml-2" onClick={() => new Audio('/api/audio/' + item.audio).play()}>
            ▶
          </button>
        )}
      </div>
      <div className="flex space-x-2">
        <button className="p-2 border" onClick={prev} id="prevBtn">Vorige</button>
        <button className="p-2 border" onClick={next} id="nextBtn">Volgende</button>
      </div>
      <div className="mt-2 text-sm">
        {index + 1}/{data.length}
      </div>
    </div>
  );
}
