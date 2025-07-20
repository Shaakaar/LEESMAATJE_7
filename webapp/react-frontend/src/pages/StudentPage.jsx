import { useEffect, useState, useRef } from 'react';

function useQuery() {
  return new URLSearchParams(window.location.search);
}

export default function StudentPage() {
  const params = useQuery();
  const studentId = params.get('student_id');
  const teacherId = parseInt(params.get('teacher_id') || '0', 10);
  const studentName = params.get('name');

  const statusRef = useRef(null);
  const sentenceRef = useRef(null);
  const [sentence, setSentence] = useState('');
  const [progress, setProgress] = useState({ index: 0, total: 0 });

  useEffect(() => {
    if (!studentId) window.location.href = '/';
  }, [studentId]);

  useEffect(() => {
    fetch('/api/next_sentence')
      .then((r) => r.json())
      .then((j) => {
        setSentence(j.sentence);
        setProgress({ index: j.index, total: j.total });
      });
  }, []);

  const nextSentence = () => {
    fetch('/api/next_sentence')
      .then((r) => r.json())
      .then((j) => {
        setSentence(j.sentence);
        setProgress({ index: j.index, total: j.total });
      });
  };

  const prevSentence = () => {
    fetch('/api/prev_sentence')
      .then((r) => r.json())
      .then((j) => {
        setSentence(j.sentence);
        setProgress({ index: j.index, total: j.total });
      });
  };

  // TODO: Recording logic is complex. Using existing script may be easier.
  // For brevity we only display sentences here.

  return (
    <div className="p-4 max-w-xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <span id="student_name">{studentName}</span>
        <button onClick={() => (window.location.href = '/')}>Uitloggen</button>
      </div>
      <div className="border p-4 rounded mb-2" ref={sentenceRef} id="sentence">
        {sentence}
      </div>
      <div className="flex space-x-2">
        <button className="p-2 border" onClick={prevSentence} id="prev">
          Vorige
        </button>
        <button className="p-2 border" onClick={nextSentence} id="next">
          Volgende
        </button>
      </div>
      <div className="mt-2 text-sm">
        {progress.index}/{progress.total}
      </div>
      <div id="status" ref={statusRef} className="mt-2"></div>
    </div>
  );
}
