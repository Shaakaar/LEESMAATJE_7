const messageEl = document.getElementById('message');
const studentLoginPane = document.getElementById('student_login');
const teacherLoginPane = document.getElementById('teacher_login');
const showStudentBtn = document.getElementById('show_student');
const showTeacherBtn = document.getElementById('show_teacher');

showStudentBtn.onclick = () => {
  studentLoginPane.style.display = 'block';
  teacherLoginPane.style.display = 'none';
  showStudentBtn.classList.add('active');
  showTeacherBtn.classList.remove('active');
};

showTeacherBtn.onclick = () => {
  studentLoginPane.style.display = 'none';
  teacherLoginPane.style.display = 'block';
  showTeacherBtn.classList.add('active');
  showStudentBtn.classList.remove('active');
};

document.getElementById('stu_login').onclick = async () => {
  const fd = new FormData();
  fd.append('username', document.getElementById('stu_user').value);
  fd.append('password', document.getElementById('stu_pass').value);
  const r = await fetch('/api/login_student', {method:'POST', body: fd});
  if(r.ok){
    const j = await r.json();
    const params = new URLSearchParams({student_id: j.student_id, teacher_id: j.teacher_id});
    window.location.href = '/static/student.html?' + params.toString();
  } else {
    messageEl.textContent = 'Student login failed';
  }
};

document.getElementById('stu_register').onclick = async () => {
  const fd = new FormData();
  fd.append('username', document.getElementById('stu_user').value);
  fd.append('password', document.getElementById('stu_pass').value);
  fd.append('teacher_id', document.getElementById('stu_teacher').value);
  const r = await fetch('/api/register_student', {method:'POST', body: fd});
  if(r.ok){
    messageEl.textContent = 'Student registered';
  } else {
    messageEl.textContent = 'Student registration failed';
  }
};

document.getElementById('teach_login').onclick = async () => {
  const fd = new FormData();
  fd.append('username', document.getElementById('teach_user').value);
  fd.append('password', document.getElementById('teach_pass').value);
  const r = await fetch('/api/login', {method:'POST', body: fd});
  if(r.ok){
    const j = await r.json();
    const params = new URLSearchParams({teacher_id: j.teacher_id});
    window.location.href = '/static/teacher.html?' + params.toString();
  } else {
    messageEl.textContent = 'Teacher login failed';
  }
};

document.getElementById('teach_register').onclick = async () => {
  const fd = new FormData();
  fd.append('username', document.getElementById('teach_user').value);
  fd.append('password', document.getElementById('teach_pass').value);
  const r = await fetch('/api/register', {method:'POST', body: fd});
  if(r.ok){
    const j = await r.json();
    messageEl.textContent = 'Teacher registered. ID: ' + j.teacher_id;
  } else {
    messageEl.textContent = 'Teacher registration failed';
  }
};
