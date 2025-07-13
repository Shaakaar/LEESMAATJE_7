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
  const tbody = document.querySelector('#results tbody');
  tbody.innerHTML = '';
  list.forEach(res => {
    const tr = document.createElement('tr');
    const tdSentence = document.createElement('td');
    tdSentence.textContent = res.sentence;
    const tdAudio = document.createElement('td');
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = '/api/audio/' + res.audio_path.split('/').pop();
    tdAudio.appendChild(audio);
    const tdResult = document.createElement('td');
    const label = document.createElement('span');
    const correct = res.json_data && res.json_data.correct;
    label.textContent = correct ? 'Correct' : 'Incorrect';
    label.className = correct ? 'label-correct' : 'label-incorrect';
    tdResult.appendChild(label);
    tr.appendChild(tdSentence);
    tr.appendChild(tdAudio);
    tr.appendChild(tdResult);
    tbody.appendChild(tr);
  });
}

loadResults();
