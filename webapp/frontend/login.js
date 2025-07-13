const messageEl = document.getElementById('message');
const studentLoginPane = document.getElementById('student_login');
const teacherLoginPane = document.getElementById('teacher_login');
const showStudentBtn = document.getElementById('show_student');
const showTeacherBtn = document.getElementById('show_teacher');
const practiceBtn = document.getElementById('stu_practice');

// Kick off model initialization as soon as this script loads
let modelsReady = false;
const modelsPromise = fetch('/api/initialize_models', {method: 'POST'})
  .then(r => r.json())
  .then(() => { modelsReady = true; })
  .catch(err => {
    console.error('Model initialisatie mislukt', err);
    messageEl.textContent = 'Initialisatie mislukt';
  });

async function waitForModels(){
  if(modelsReady) return;
  messageEl.innerHTML = '<span class="spinner"></span>Laden...';
  try {
    await modelsPromise;
  } finally {
    messageEl.textContent = '';
  }
}

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
    messageEl.textContent = 'Voer een klascode in';
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
    await waitForModels();
    const params = new URLSearchParams({student_id: j.student_id, name: document.getElementById('stu_user').value});
    if(j.teacher_id !== null){
      params.append('teacher_id', j.teacher_id);
    }
    window.location.href = '/static/student.html?' + params.toString();
  } else {
    const j = await r.json();
    messageEl.textContent = j.detail || 'Leerling inloggen mislukt';
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
    messageEl.textContent = 'Leerling geregistreerd';
  } else {
    const j = await r.json();
    messageEl.textContent = j.detail || 'Registratie leerling mislukt';
  }
};

document.getElementById('teach_login').onclick = async () => {
  const fd = new FormData();
  fd.append('username', document.getElementById('teach_user').value);
  fd.append('password', document.getElementById('teach_pass').value);
  const r = await fetch('/api/login', {method:'POST', body: fd});
  if(r.ok){
    const j = await r.json();
    await waitForModels();
    const params = new URLSearchParams({teacher_id: j.teacher_id});
    window.location.href = '/static/teacher.html?' + params.toString();
  } else {
    messageEl.textContent = 'Leraar inloggen mislukt';
  }
};

document.getElementById('teach_register').onclick = async () => {
  const fd = new FormData();
  fd.append('username', document.getElementById('teach_user').value);
  fd.append('password', document.getElementById('teach_pass').value);
  const r = await fetch('/api/register', {method:'POST', body: fd});
  if(r.ok){
    const j = await r.json();
    messageEl.textContent = 'Leraar geregistreerd. ID: ' + j.teacher_id;
  } else {
    messageEl.textContent = 'Registratie leraar mislukt';
  }
};
