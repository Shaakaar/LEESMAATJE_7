const params = new URLSearchParams(window.location.search);
const teacherId = parseInt(params.get('teacher_id'), 10);
if (isNaN(teacherId)) {
  window.location.href = '/';
}

document.getElementById('class_code').textContent = 'Klas ' + teacherId;

document.getElementById('logout').onclick = () => {
  window.location.assign('/');
};

async function loadStudents() {
  try {
    const r = await fetch('/api/student_summaries/' + teacherId);
    if (!r.ok) throw new Error('Request failed');
    const list = await r.json();
  const tbody = document.querySelector('#students tbody');
  tbody.innerHTML = '';
  list.forEach(stu => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const link = document.createElement('a');
    link.textContent = stu.username;
    const params = new URLSearchParams({student_id: stu.id, teacher_id: teacherId, name: stu.username});
    link.href = '/static/student_results.html?' + params.toString();
    tdName.appendChild(link);
    const tdLast = document.createElement('td');
    tdLast.textContent = stu.last_sentence ? new Date(stu.last_sentence * 1000).toLocaleString() : '-';
    const tdMinutes = document.createElement('td');
    tdMinutes.textContent = stu.minutes_7d.toFixed(1);
    tr.appendChild(tdName);
    tr.appendChild(tdLast);
    tr.appendChild(tdMinutes);
    tbody.appendChild(tr);
  });
  } catch (err) {
    console.error('Laden van leerlingen mislukt', err);
  }
}

loadStudents();
