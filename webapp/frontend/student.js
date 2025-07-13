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
let recordedChunks = [];
let playbackUrl = null;

const statusEl = document.getElementById('status');
const sentenceEl = document.getElementById('sentence');
const feedbackModule = document.querySelector('.feedback');
const textEl = feedbackModule.querySelector('.text');
const replayBtn = feedbackModule.querySelector('.replay-btn');
const progressBar = document.getElementById('progress_bar');
const progressText = document.getElementById('progress_text');
const recordBtn = document.getElementById('record');
const stopBtn = document.getElementById('stop');
const playbackBtn = document.getElementById('playback');
const retryBtn = document.getElementById('retry');
const nextBtn = document.getElementById('next');
progressText.textContent = '';

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

async function initModels(){
  statusEl.textContent = '🌀 Loading models…';
  try {
    const r = await fetch('/api/initialize_models', {method:'POST'});
    if(!r.ok) throw new Error('Failed');
    statusEl.textContent = 'Models ready';
    nextBtn.disabled = false;
    setTimeout(() => {
      statusEl.classList.add('fade-out');
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.classList.remove('fade-out');
      }, 1000);
    }, 2000);
  } catch(err) {
    statusEl.textContent = 'Could not load models';
    recordBtn.disabled = true;
    stopBtn.disabled = true;
    playbackBtn.disabled = true;
    retryBtn.disabled = true;
    nextBtn.disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', initModels);

nextBtn.onclick = async () => {
  const r = await fetch('/api/next_sentence');
  const j = await r.json();
  sentence = j.sentence;
  sentenceEl.textContent = sentence;
  feedbackModule.classList.remove('visible');
  progressBar.style.width = ((j.index / j.total) * 100) + '%';
  progressText.textContent = `${j.index}/${j.total}`;
  recordBtn.disabled = false;
  retryBtn.disabled = true;
  playbackBtn.disabled = true;
  nextBtn.disabled = true;
};

recordBtn.onclick = async () => {
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
    recordedChunks.push(pcm);
    const blob = new Blob([pcm], {type:'application/octet-stream'});
    const f = new FormData();
    f.append('file', blob, 'chunk.pcm');
    fetch('/api/realtime/chunk/'+sessionId, {method:'POST', body:f});
  };
  recordedChunks = [];
  playbackUrl && URL.revokeObjectURL(playbackUrl);
  playbackUrl = null;
  recording = true;
  stopBtn.disabled = false;
  recordBtn.disabled = true;
  retryBtn.disabled = true;
  playbackBtn.disabled = true;
  statusEl.innerHTML = '<span class="spinner"></span>Recording';
};

stopBtn.onclick = async () => {
  recording = false;
  processor.disconnect();
  stream.getTracks().forEach(t => t.stop());
  stopBtn.disabled = true;
  statusEl.innerHTML = '<span class="spinner"></span>Analyzing';

  const stopPromise = fetch('/api/realtime/stop/' + sessionId, { method: 'POST' })
    .then(r => r.json());
  sessionId = null;
  setTimeout(async () => {
    statusEl.innerHTML = '<span class="spinner"></span>Playing feedback';
    playAudio('/api/audio/' + fillerAudio, async () => {
      const data = await stopPromise;
      const total = recordedChunks.reduce((n,c)=>n+c.length,0);
      const flat = new Int16Array(total);
      let pos = 0;
      for(const c of recordedChunks){
        flat.set(c,pos);
        pos += c.length;
      }
      const wav = encodeWav(flat, audioCtx.sampleRate);
      playbackUrl = URL.createObjectURL(wav);
      showFeedback(data);
      statusEl.textContent = '';
      playbackBtn.disabled = false;
      retryBtn.disabled = false;
      nextBtn.disabled = false;
  });
  }, delaySeconds * 1000);
};

function playAudio(url, cb){
  const a = new Audio(url);
  a.onended = cb;
  a.play();
}

function encodeWav(samples, sampleRate){
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off,str)=>{for(let i=0;i<str.length;i++) view.setUint8(off+i,str.charCodeAt(i));};
  writeStr(0,'RIFF');
  view.setUint32(4,36 + samples.length * 2,true);
  writeStr(8,'WAVEfmt ');
  view.setUint32(16,16,true); // PCM
  view.setUint16(20,1,true);
  view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*2,true);
  view.setUint16(32,2,true);
  view.setUint16(34,16,true);
  writeStr(36,'data');
  view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++) view.setInt16(44+i*2,samples[i],true);
  return new Blob([view],{type:'audio/wav'});
}

function showFeedback(data){
  textEl.textContent = data.feedback_text;
  feedbackModule.classList.add('visible');
  let negative;
  if(typeof data.correct === 'boolean'){
    negative = !data.correct;
  } else {
    negative = /opnieuw|niet gehoord|again|wrong/i.test(data.feedback_text);
  }
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

playbackBtn.onclick = () => {
  if(playbackUrl){
    playAudio(playbackUrl);
  }
};

retryBtn.onclick = () => {
  feedbackModule.classList.remove('visible');
  playbackUrl && URL.revokeObjectURL(playbackUrl);
  playbackUrl = null;
  recordedChunks = [];
  statusEl.textContent = '';
  recordBtn.disabled = false;
  playbackBtn.disabled = true;
  retryBtn.disabled = true;
  nextBtn.disabled = true;
};

document.getElementById('logout').onclick = () => {
  window.location.href = '/';
};
