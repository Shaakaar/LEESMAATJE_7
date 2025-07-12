const params = new URLSearchParams(window.location.search);
const teacherId = params.get('teacher_id');
if(!teacherId){
  window.location.href = '/';
}

document.getElementById('class_code').textContent = 'Class ' + teacherId;

document.getElementById('logout').onclick = () => {
  window.location.href = '/';
};

async function loadStudents(){
  const r = await fetch('/api/student_summaries/' + teacherId);
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
    tdLast.textContent = stu.last_session ? new Date(stu.last_session * 1000).toLocaleString() : '-';
    const tdMinutes = document.createElement('td');
    tdMinutes.textContent = stu.minutes_7d.toFixed(1);
    tr.appendChild(tdName);
    tr.appendChild(tdLast);
    tr.appendChild(tdMinutes);
    tbody.appendChild(tr);
  });
}

loadStudents();
