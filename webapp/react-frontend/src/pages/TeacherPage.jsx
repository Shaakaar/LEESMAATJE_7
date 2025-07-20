import { useEffect, useState } from 'react';

export default function TeacherPage() {
  const params = new URLSearchParams(window.location.search);
  const teacherId = parseInt(params.get('teacher_id'), 10);

  const [students, setStudents] = useState([]);

  useEffect(() => {
    if (isNaN(teacherId)) {
      window.location.href = '/';
      return;
    }
    fetch('/api/student_summaries/' + teacherId)
      .then((r) => r.json())
      .then(setStudents);
  }, [teacherId]);

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl mb-2">Klas {teacherId}</h1>
      <table className="w-full text-left border">
        <thead>
          <tr>
            <th className="border p-2">Leerling</th>
            <th className="border p-2">Laatste zin</th>
            <th className="border p-2">Minuten (7d)</th>
          </tr>
        </thead>
        <tbody>
          {students.map((stu) => (
            <tr key={stu.id} className="border">
              <td className="p-2">
                <a
                  href={`/static/student_results.html?student_id=${stu.id}&teacher_id=${teacherId}&name=${stu.username}`}
                >
                  {stu.username}
                </a>
              </td>
              <td className="p-2">
                {stu.last_sentence ? new Date(stu.last_sentence * 1000).toLocaleString() : '-'}
              </td>
              <td className="p-2">{stu.minutes_7d.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="mt-4" onClick={() => (window.location.href = '/')}>Uitloggen</button>
    </div>
  );
}
