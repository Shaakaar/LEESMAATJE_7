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
    <div>
      <div className="top-bar">
        <h1>Leesmaatje</h1>
        <span id="student_name_bar">{studentName}</span>
        <button id="logout" className="accent" onClick={() => (window.location.href = '/')}>Uitloggen</button>
      </div>
      <div className="results-container">
        <h2>Oefenresultaten</h2>
        <div className="table-wrapper">
          <table id="results" className="results-table">
            <thead>
              <tr>
                <th>Zin</th>
                <th>Audio</th>
                <th>Resultaat</th>
              </tr>
            </thead>
            <tbody>
              {list.map((res) => {
                const base = res.audio_path.split(/[/\\]/).pop();
                const correct = res.json_data && res.json_data.correct;
                return (
                  <tr key={res.id}>
                    <td>{res.sentence}</td>
                    <td>
                      <audio controls src={'/api/audio/' + base}></audio>
                    </td>
                    <td>{correct ? 'Goed' : 'Fout'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
