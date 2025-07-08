let audioCtx;
let processor;
let stream;
let recording = false;
let sentence = "";
let sessionId = null;
let fillerAudio = null;
let delaySeconds = 0;

const statusEl = document.getElementById('status');
const sentenceEl = document.getElementById('sentence');
const feedbackEl = document.getElementById('feedback');

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
  feedbackEl.textContent = '';
};

document.getElementById('record').onclick = async () => {
  if (!sentence) return;
  stream = await navigator.mediaDevices.getUserMedia({audio:true});
  audioCtx = new AudioContext();
  const fd = new FormData();
  fd.append('sentence', sentence);
  fd.append('sample_rate', audioCtx.sampleRate);
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

