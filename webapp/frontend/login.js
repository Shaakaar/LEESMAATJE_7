const messageEl = document.getElementById('message');
const studentLoginPane = document.getElementById('student_login');
const teacherLoginPane = document.getElementById('teacher_login');
const showStudentBtn = document.getElementById('show_student');
const showTeacherBtn = document.getElementById('show_teacher');
const practiceBtn = document.getElementById('stu_practice');

let practiceMode = false;

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
  const code = document.getElementById('stu_teacher').value.trim();
  if(!practiceMode && !code){
    messageEl.textContent = 'Please enter a class code';
    return;
  }
  const fd = new FormData();
  fd.append('username', document.getElementById('stu_user').value);
  fd.append('password', document.getElementById('stu_pass').value);
  if(!practiceMode && code){
    fd.append('teacher_id', code);
  }
  const r = await fetch('/api/login_student', {method:'POST', body: fd});
  if(r.ok){
    const j = await r.json();
    const params = new URLSearchParams({student_id: j.student_id, name: document.getElementById('stu_user').value});
    if(j.teacher_id !== null){
      params.append('teacher_id', j.teacher_id);
    }
    window.location.href = '/static/student.html?' + params.toString();
  } else {
    const j = await r.json();
    messageEl.textContent = j.detail || 'Student login failed';
  }
};

practiceBtn.onclick = () => {
  practiceMode = !practiceMode;
  practiceBtn.classList.toggle('active');
  messageEl.textContent = '';
};

document.getElementById('stu_register').onclick = async () => {
  const fd = new FormData();
  fd.append('username', document.getElementById('stu_user').value);
  fd.append('password', document.getElementById('stu_pass').value);
  const code = document.getElementById('stu_teacher').value.trim();
  if(code){
    fd.append('teacher_id', code);
  }
  const r = await fetch('/api/register_student', {method:'POST', body: fd});
  if(r.ok){
    messageEl.textContent = 'Student registered';
  } else {
    const j = await r.json();
    messageEl.textContent = j.detail || 'Student registration failed';
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
