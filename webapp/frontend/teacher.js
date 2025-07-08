const params = new URLSearchParams(window.location.search);
const teacherId = params.get('teacher_id');
if(!teacherId){
  window.location.href = '/';
}

async function loadResults(){
  const r = await fetch('/api/results/' + teacherId);
  const list = await r.json();
  const ul = document.getElementById('results');
  ul.innerHTML = '';
  list.forEach(res => {
    const li = document.createElement('li');
    li.textContent = res.timestamp + ' - ' + res.student + ': ' + res.sentence;
    li.onclick = async () => {
      const rr = await fetch('/api/result/' + res.id);
      const j = await rr.json();
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = '/api/audio/' + j.audio_path.split('/').pop();
      li.appendChild(audio);
    };
    ul.appendChild(li);
  });
}

loadResults();
