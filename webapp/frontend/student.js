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
let studentName = null;
let lastFeedbackAudio = null;

const statusEl = document.getElementById('status');
const sentenceEl = document.getElementById('sentence');
const feedbackModule = document.querySelector('.feedback');
const textEl = feedbackModule.querySelector('.text');
const replayBtn = feedbackModule.querySelector('.replay-btn');
const progressBar = document.getElementById('progress_bar');

const params = new URLSearchParams(window.location.search);
studentId = params.get('student_id');
teacherId = parseInt(params.get('teacher_id'), 10);
studentName = params.get('name');
if(!studentId){
  window.location.href = '/';
}
if(isNaN(teacherId)){
  teacherId = 0;
}
if(studentName){
  document.getElementById('student_name').textContent = studentName;
}

document.getElementById('init').onclick = async () => {
  statusEl.textContent = 'Loading models...';
  await fetch('/api/initialize_models', {method:'POST'});
  statusEl.textContent = 'Models ready';
};

document.getElementById('next').onclick = async () => {
  const r = await fetch('/api/next_sentence');
  const j = await r.json();
  sentence = j.sentence;
  sentenceEl.textContent = sentence;
  feedbackModule.classList.remove('visible');
  progressBar.style.width = ((j.index / j.total) * 100) + '%';
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
      const data = await stopPromise;
      showFeedback(data);
      statusEl.textContent = '';
    });
  }, delaySeconds * 1000);
};

function playAudio(url, cb){
  const a = new Audio(url);
  a.onended = cb;
  a.play();
}

function showFeedback(data){
  textEl.textContent = data.feedback_text;
  feedbackModule.classList.add('visible');
  const negative = /opnieuw|niet gehoord|again|wrong/i.test(data.feedback_text);
  feedbackModule.classList.toggle('negative', negative);
  feedbackModule.classList.toggle('positive', !negative);
  lastFeedbackAudio = data.feedback_audio;
  playAudio('/api/audio/' + data.feedback_audio);
}

replayBtn.onclick = () => {
  if(lastFeedbackAudio){
    playAudio('/api/audio/' + lastFeedbackAudio);
  }
};
