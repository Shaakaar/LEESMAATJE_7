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
    tr.classList.add('fade-in');
    const tdSentence = document.createElement('td');
    tdSentence.textContent = res.sentence;
    const tdAudio = document.createElement('td');
    const audio = document.createElement('audio');
    audio.controls = true;
    // Extract the filename from the stored path. Results may contain
    // Windows or POSIX style separators, so handle both.
    const baseName = res.audio_path.split(/[\\/]/).pop();
    audio.src = '/api/audio/' + baseName;
    tdAudio.appendChild(audio);
    const tdResult = document.createElement('td');
    const label = document.createElement('span');
    const correct = res.json_data && res.json_data.correct;
    label.textContent = correct ? 'Goed' : 'Fout';
    label.className = correct ? 'label-correct' : 'label-incorrect';
    tdResult.appendChild(label);
    tr.appendChild(tdSentence);
    tr.appendChild(tdAudio);
    tr.appendChild(tdResult);
    tbody.appendChild(tr);
  });
}

loadResults();
