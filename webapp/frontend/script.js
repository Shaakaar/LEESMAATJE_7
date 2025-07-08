let audioCtx;
let processor;
let stream;
let recording = false;
let sentence = "";
let sessionId = null;
let fillerAudio = null;
let delaySeconds = 0;
let teacherId = null;
let studentId = null;

const statusEl = document.getElementById('status');
const sentenceEl = document.getElementById('sentence');
const feedbackEl = document.getElementById('feedback');
const messageEl = document.getElementById('message');

document.getElementById('init').onclick = async () => {
  statusEl.textContent = 'Loading models...';
  await fetch('/api/initialize_models', {method:'POST'});
  statusEl.textContent = 'Models ready';
};

document.getElementById('stu_login').onclick = async () => {
  const fd = new FormData();
  fd.append('username', document.getElementById('stu_user').value);
  fd.append('password', document.getElementById('stu_pass').value);
  const r = await fetch('/api/login_student', {method:'POST', body: fd});
  if(r.ok){
    const j = await r.json();
    studentId = j.student_id;
    teacherId = j.teacher_id;
    document.getElementById('student_ui').style.display = 'block';
    document.getElementById('teacher_ui').style.display = 'none';
    messageEl.textContent = '';
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
    teacherId = j.teacher_id;
    document.getElementById('teacher_ui').style.display = 'block';
    document.getElementById('student_ui').style.display = 'none';
    document.getElementById('teach_id_display').style.display = 'block';
    document.getElementById('teach_id').textContent = teacherId;
    messageEl.textContent = '';
    loadResults();
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
    teacherId = j.teacher_id;
    document.getElementById('teach_id_display').style.display = 'block';
    document.getElementById('teach_id').textContent = teacherId;
    messageEl.textContent = 'Teacher registered';
  } else {
    messageEl.textContent = 'Teacher registration failed';
  }
};

document.getElementById('next').onclick = async () => {
  const r = await fetch('/api/next_sentence');
  const j = await r.json();
  sentence = j.sentence;
  sentenceEl.textContent = sentence;
  feedbackEl.textContent = '';
};

document.getElementById('record').onclick = async () => {
  if (!sentence) return;
  stream = await navigator.mediaDevices.getUserMedia({audio:true});
  audioCtx = new AudioContext();
  const fd = new FormData();
  fd.append('sentence', sentence);
  fd.append('sample_rate', audioCtx.sampleRate);
  fd.append('teacher_id', teacherId);
  fd.append('student_id', studentId);
  const r = await fetch('/api/realtime/start', {method:'POST', body: fd});
  const j = await r.json();
  sessionId = j.session_id;
  fillerAudio = j.filler_audio;
  delaySeconds = j.delay_seconds;
  const source = audioCtx.createMediaStreamSource(stream);
  processor = audioCtx.createScriptProcessor(4096,1,1);
  source.connect(processor);
  processor.connect(audioCtx.destination);
  processor.onaudioprocess = e => {
    if(!recording) return;
    const buf = e.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(buf.length);
    for(let i=0;i<buf.length;i++){
      let s = Math.max(-1, Math.min(1, buf[i]));
      pcm[i] = s*32767;
    }
    const blob = new Blob([pcm], {type:'application/octet-stream'});
    const f = new FormData();
    f.append('file', blob, 'chunk.pcm');
    fetch('/api/realtime/chunk/'+sessionId, {method:'POST', body:f});
  };
  recording = true;
  document.getElementById('stop').disabled = false;
  statusEl.textContent = 'recording';
};

document.getElementById('stop').onclick = async () => {
  recording = false;
  processor.disconnect();
  stream.getTracks().forEach(t => t.stop());
  document.getElementById('stop').disabled = true;
  statusEl.textContent = 'analysing';

  const stopPromise = fetch('/api/realtime/stop/' + sessionId, { method: 'POST' })
    .then(r => r.json());
  sessionId = null;

  setTimeout(async () => {
    statusEl.textContent = 'playing';
    playAudio('/api/audio/' + fillerAudio, async () => {
      const j = await stopPromise;
      feedbackEl.textContent = j.feedback_text;
      playAudio('/api/audio/' + j.feedback_audio, () => {
        statusEl.textContent = '';
      });
    });
  }, delaySeconds * 1000);
};

function playAudio(url, cb){
  const a = new Audio(url);
  a.onended = cb;
  a.play();
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

