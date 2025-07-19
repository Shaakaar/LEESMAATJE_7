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
let pendingChunks = [];
let startPromise = null;
let analyser;
let dataArray;

const statusEl = document.getElementById('status');
const sentenceEl = document.getElementById('sentence');
const feedbackModule = document.querySelector('.feedback');
const textEl = feedbackModule.querySelector('.text');
const replayBtn = feedbackModule.querySelector('.replay-btn');
const progressBar = document.getElementById('progress_bar');
const progressText = document.getElementById('progress_text');
const micBtn = document.getElementById('mic');
const micWrapper = document.querySelector('.mic-wrapper');
const waveCanvas = document.getElementById('mic_waveform');
const waveCtx = waveCanvas.getContext('2d');
const playbackBtn = document.getElementById('playback');
const retryBtn = document.getElementById('retry');
const nextBtn = document.getElementById('next');
const prevBtn = document.getElementById('prev');
progressText.textContent = '';
// Models are initialized on the login page, so no need to
// initialize them again here.


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




nextBtn.onclick = async () => {
  const r = await fetch('/api/next_sentence');
  const j = await r.json();
  if(!r.ok){
    statusEl.textContent = 'Fout: ' + j.detail;
    return;
  }
  sentence = j.sentence;
  sentenceEl.textContent = sentence;
  feedbackModule.classList.remove('visible');
  progressBar.style.width = ((j.index / j.total) * 100) + '%';
  progressText.textContent = `${j.index}/${j.total}`;
  micBtn.disabled = false;
  if(retryBtn) retryBtn.disabled = true;
  playbackBtn.disabled = true;
  nextBtn.disabled = true;
  prevBtn.disabled = false;
};

prevBtn.onclick = async () => {
  const r = await fetch('/api/prev_sentence');
  const j = await r.json();
  if(!r.ok){
    statusEl.textContent = 'Fout: ' + j.detail;
    return;
  }
  sentence = j.sentence;
  sentenceEl.textContent = sentence;
  feedbackModule.classList.remove('visible');
  progressBar.style.width = ((j.index / j.total) * 100) + '%';
  progressText.textContent = `${j.index}/${j.total}`;
  micBtn.disabled = false;
  if(retryBtn) retryBtn.disabled = true;
  playbackBtn.disabled = true;
  nextBtn.disabled = true;
};

async function startRecording(){
  if (!sentence) return;
  stream = await navigator.mediaDevices.getUserMedia({audio:true});
  audioCtx = new AudioContext();
  const fd = new FormData();
  fd.append('sentence', sentence);
  fd.append('sample_rate', audioCtx.sampleRate);
  fd.append('teacher_id', teacherId);
  fd.append('student_id', studentId);

  pendingChunks = [];
  startPromise = fetch('/api/realtime/start', {method:'POST', body: fd})
    .then(async r => {
      const j = await r.json();
      if(!r.ok){
        throw new Error(j.detail);
      }
      sessionId = j.session_id;
      fillerAudio = j.filler_audio;
      delaySeconds = j.delay_seconds;
      for(const blob of pendingChunks){
        const f = new FormData();
        f.append('file', blob, 'chunk.pcm');
        fetch('/api/realtime/chunk/'+sessionId, {method:'POST', body:f});
      }
      pendingChunks = [];
    })
    .catch(err => {
      statusEl.textContent = 'Fout: ' + err.message;
      recording = false;
      stopVisualizer();
    })
    .finally(() => { startPromise = null; });

  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  dataArray = new Uint8Array(analyser.fftSize);
  processor = audioCtx.createScriptProcessor(4096,1,1);
  source.connect(analyser);
  analyser.connect(processor);
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
    if(sessionId){
      const f = new FormData();
      f.append('file', blob, 'chunk.pcm');
      fetch('/api/realtime/chunk/'+sessionId, {method:'POST', body:f});
    } else {
      pendingChunks.push(blob);
    }
  };
  recordedChunks = [];
  playbackUrl && URL.revokeObjectURL(playbackUrl);
  playbackUrl = null;
  recording = true;
  startVisualizer();
  micBtn.classList.add('active');
  micBtn.querySelector('.label').textContent = 'Luisteren...';
  if(retryBtn) retryBtn.disabled = true;
  playbackBtn.disabled = true;
  nextBtn.disabled = true;
  statusEl.innerHTML = '<span class="spinner"></span>Opnemen';
}

micBtn.onclick = () => {
  if(recording){
    stopRecording();
  } else {
    startRecording();
  }
};

async function stopRecording(){
  recording = false;
  stopVisualizer();
  processor.disconnect();
  stream.getTracks().forEach(t => t.stop());
  micBtn.disabled = true;
  micBtn.classList.remove('active');
  micBtn.querySelector('.label').textContent = 'Analyseren...';
  statusEl.innerHTML = '<span class="spinner"></span>Analyseren';

  if(startPromise){
    try {
      await startPromise;
    } catch(err) {
      // start failed, nothing to stop
      return;
    }
  }

  const stopPromise = fetch('/api/realtime/stop/' + sessionId, { method: 'POST' })
    .then(async r => {
      const j = await r.json();
      if(!r.ok){
        statusEl.textContent = 'Fout: ' + j.detail;
        throw new Error(j.detail);
      }
      return j;
    });
  sessionId = null;
  setTimeout(async () => {
    statusEl.innerHTML = '<span class="spinner"></span>Feedback afspelen';
    playAudio('/api/audio/' + fillerAudio, async () => {
      let data;
      try {
        data = await stopPromise;
      } catch(err) {
        statusEl.textContent = 'Fout: ' + err.message;
        return;
      }
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
      micBtn.disabled = false;
      micBtn.querySelector('.label').textContent = 'Opnemen';
      playbackBtn.disabled = false;
        if(retryBtn) retryBtn.disabled = false;
      nextBtn.disabled = false;
      prevBtn.disabled = false;
  });
  }, delaySeconds * 1000);
}

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

function drawWave(level){
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  waveCtx.clearRect(0,0,w,h);
  const base = w/2 - 25;
  const radius = base + level * 25;
  waveCtx.beginPath();
  waveCtx.arc(w/2, h/2, radius, 0, Math.PI*2);
  waveCtx.strokeStyle = 'rgba(79,140,255,0.8)';
  waveCtx.lineWidth = 4;
  waveCtx.stroke();
}

function visualize(){
  if(!recording) return;
  analyser.getByteTimeDomainData(dataArray);
  let sum = 0;
  for(let i=0;i<dataArray.length;i++){
    const val = dataArray[i] - 128;
    sum += val*val;
  }
  const rms = Math.sqrt(sum/dataArray.length)/128;
  drawWave(rms);
  requestAnimationFrame(visualize);
}

function startVisualizer(){
  micWrapper.classList.add('recording');
  visualize();
}

function stopVisualizer(){
  micWrapper.classList.remove('recording');
  waveCtx.clearRect(0,0,waveCanvas.width,waveCanvas.height);
}

function showFeedback(data){
  const html = data.feedback_text.replace(/\*\*(.*?)\*\*/g,
    '<strong class="highlight">$1</strong>');
  textEl.innerHTML = html;
  feedbackModule.classList.add('visible');
  const words = Array.from(sentenceEl.querySelectorAll('.word'));
  words.forEach(w => w.classList.remove('wrong'));
  if(Array.isArray(data.errors)){
    for(const err of data.errors){
      const expected = (err.expected_word || err.word || '').toLowerCase();
      for(const span of words){
        if(span.textContent.trim().toLowerCase() === expected){
          span.classList.add('wrong','shake');
          setTimeout(()=>span.classList.remove('shake'),90);
          break;
        }
      }
    }
  }
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

if(retryBtn){
  retryBtn.onclick = () => {
    feedbackModule.classList.remove('visible');
    playbackUrl && URL.revokeObjectURL(playbackUrl);
    playbackUrl = null;
    recordedChunks = [];
    statusEl.textContent = '';
    micBtn.disabled = false;
    micBtn.querySelector('.label').textContent = 'Opnemen';
    playbackBtn.disabled = true;
    retryBtn.disabled = true;
    nextBtn.disabled = true;
  };
}

document.getElementById('logout').onclick = () => {
  window.location.href = '/';
};
