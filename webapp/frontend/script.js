let audioCtx;
let processor;
let stream;
let chunks = [];
let recording = false;
let sentence = "";

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
  chunks = [];
  stream = await navigator.mediaDevices.getUserMedia({audio:true});
  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  processor = audioCtx.createScriptProcessor(4096,1,1);
  source.connect(processor);
  processor.connect(audioCtx.destination);
  processor.onaudioprocess = e => {
    if(!recording) return;
    const buf = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(buf));
  };
  recording = true;
  document.getElementById('stop').disabled = false;
  statusEl.textContent = 'recording';
};

document.getElementById('stop').onclick = async () => {
  recording = false;
  processor.disconnect();
  stream.getTracks().forEach(t=>t.stop());
  const blob = exportWav(chunks, audioCtx.sampleRate);
  document.getElementById('stop').disabled = true;
  statusEl.textContent = 'analysing';
  const fd = new FormData();
  fd.append('sentence', sentence);
  fd.append('file', blob, 'rec.wav');
  const r = await fetch('/api/process', {method:'POST', body:fd});
  const j = await r.json();
  feedbackEl.textContent = j.feedback_text;
  statusEl.textContent = 'playing';
  setTimeout(()=>{
    playAudio('/api/audio/'+j.filler_audio, ()=>{
      playAudio('/api/audio/'+j.feedback_audio, ()=>{
        statusEl.textContent='';
      });
    });
  }, j.delay_seconds*1000);
};

function playAudio(url, cb){
  const a = new Audio(url);
  a.onended = cb;
  a.play();
}

function exportWav(buffers, sampleRate){
  let length = 0;
  buffers.forEach(b=> length += b.length);
  const pcm = new Int16Array(length);
  let offset = 0;
  buffers.forEach(b=>{
    for(let i=0;i<b.length;i++){
      let s = Math.max(-1, Math.min(1, b[i]));
      pcm[offset++] = s*32767;
    }
  });
  const wav = encodeWav(pcm, sampleRate);
  return new Blob([wav], {type:'audio/wav'});
}

function encodeWav(samples, sampleRate){
  const buffer = new ArrayBuffer(44 + samples.length*2);
  const view = new DataView(buffer);
  function writeString(view, offset, string){
    for(let i=0;i<string.length;i++) view.setUint8(offset+i, string.charCodeAt(i));
  }
  let offset = 0;
  writeString(view, offset, 'RIFF'); offset+=4;
  view.setUint32(offset, 36 + samples.length*2, true); offset+=4;
  writeString(view, offset, 'WAVE'); offset+=4;
  writeString(view, offset, 'fmt '); offset+=4;
  view.setUint32(offset, 16, true); offset+=4;
  view.setUint16(offset, 1, true); offset+=2;
  view.setUint16(offset, 1, true); offset+=2;
  view.setUint32(offset, sampleRate, true); offset+=4;
  view.setUint32(offset, sampleRate*2, true); offset+=4;
  view.setUint16(offset, 2, true); offset+=2;
  view.setUint16(offset, 16, true); offset+=2;
  writeString(view, offset, 'data'); offset+=4;
  view.setUint32(offset, samples.length*2, true); offset+=4;
  for(let i=0;i<samples.length;i++, offset+=2){
    view.setInt16(offset, samples[i], true);
  }
  return view;
}
