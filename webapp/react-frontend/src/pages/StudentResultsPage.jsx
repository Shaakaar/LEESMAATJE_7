import { useEffect, useState } from 'react';

export default function StudentResultsPage() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('student_id');
  const studentName = params.get('name');
  const [list, setList] = useState([]);

  useEffect(() => {
    if (!studentId) {
      window.location.href = '/';
      return;
    }
    fetch('/api/student_results/' + studentId)
      .then((r) => r.json())
      .then(setList);
  }, [studentId]);

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl mb-2">Resultaten {studentName}</h1>
      <table className="w-full text-left border">
        <thead>
          <tr>
            <th className="border p-2">Zin</th>
            <th className="border p-2">Audio</th>
            <th className="border p-2">Resultaat</th>
          </tr>
        </thead>
        <tbody>
          {list.map((res) => {
            const base = res.audio_path.split(/[/\\]/).pop();
            const correct = res.json_data && res.json_data.correct;
            return (
              <tr key={res.id} className="border">
                <td className="p-2">{res.sentence}</td>
                <td className="p-2">
                  <audio controls src={'/api/audio/' + base}></audio>
                </td>
                <td className="p-2">{correct ? 'Goed' : 'Fout'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="mt-4" onClick={() => (window.location.href = '/')}>Uitloggen</button>
    </div>
  );
}
