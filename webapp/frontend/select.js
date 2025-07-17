const params = new URLSearchParams(window.location.search);
const studentId = params.get('student_id');
const teacherId = params.get('teacher_id');
const name = params.get('name');
if(!studentId){
  window.location.href = '/';
}
if(name){
  document.getElementById('student_name').textContent = name;
}
document.getElementById('logout').onclick = () => {
  window.location.href = '/';
};

const bar = document.getElementById('load_bar');

document.getElementById('start').onclick = () => {
  const theme = document.getElementById('theme').value;
  const level = document.getElementById('level').value;
  bar.style.width = '0%';
  const ev = new EventSource(`/api/start_story?theme=${theme}&level=${level}`);
  const data = [];
  let filler = null;
  ev.addEventListener('progress', e => {
    bar.style.width = (parseFloat(e.data)*100) + '%';
  });
  ev.addEventListener('filler', e => { filler = JSON.parse(e.data).audio; });
  ev.addEventListener('sentence', e => { data.push({type:'sentence', ...JSON.parse(e.data)}); });
  ev.addEventListener('direction', e => { data.push({type:'direction', ...JSON.parse(e.data)}); });
  ev.addEventListener('complete', () => {
    ev.close();
    localStorage.setItem('story_data', JSON.stringify(data));
    localStorage.setItem('theme', theme);
    localStorage.setItem('level', level);
    if(filler){
      localStorage.setItem('filler_audio', filler);
    }
    const q = new URLSearchParams({student_id: studentId, teacher_id: teacherId, name});
    window.location.href = '/static/story.html?' + q.toString();
  });
};

