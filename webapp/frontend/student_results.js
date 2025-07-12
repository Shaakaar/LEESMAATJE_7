const params = new URLSearchParams(window.location.search);
const studentId = params.get('student_id');
const teacherId = params.get('teacher_id');
const studentName = params.get('name');
if(!studentId){
  window.location.href = '/';
}
if(studentName){
  document.getElementById('student_name_bar').textContent = studentName;
}

document.getElementById('logout').onclick = () => {
  window.location.href = '/';
};

async function loadResults(){
  const r = await fetch('/api/student_results/' + studentId);
  const list = await r.json();
  const ul = document.getElementById('results');
  ul.innerHTML = '';
  list.forEach(res => {
    const li = document.createElement('li');
    const sent = document.createElement('div');
    sent.textContent = res.sentence;
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = '/api/audio/' + res.audio_path.split('/').pop();
    const label = document.createElement('span');
    const correct = res.json_data && res.json_data.correct;
    label.textContent = correct ? 'Correct' : 'Incorrect';
    label.className = correct ? 'label-correct' : 'label-incorrect';
    li.appendChild(sent);
    li.appendChild(audio);
    li.appendChild(label);
    ul.appendChild(li);
  });
}

loadResults();
