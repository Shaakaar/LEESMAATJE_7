import { useEffect, useRef, useState } from 'react';

const SEND_INTERVAL_MS = 100; // how often to upload audio (in ms)
const DEBUG = false; // set true to enable chunk logs
const PCM_QUEUE: Int16Array[] = [];
let lastSend = 0;

export interface FeedbackData {
  feedback_text: string;
  feedback_audio: string;
  errors?: { word?: string; expected_word?: string }[];
  correct?: boolean;
}

interface RecorderOptions {
  sentence: string;
  teacherId: number;
  studentId: string;
  onFeedback: (data: FeedbackData) => void;
  canvas?: HTMLCanvasElement | null;
}

export function useRecorder({ sentence, teacherId, studentId, onFeedback, canvas }: RecorderOptions) {
  const recordingRef = useRef(false); // for audio-thread guard
  const [recording, setRecording] = useState(false); // UI only
  const [status, setStatus] = useState('');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sampleRateRef = useRef<number>(0);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const fillerAudioRef = useRef<string | null>(null);
  const delayRef = useRef<number>(0);
  const recordedChunksRef = useRef<Int16Array[]>([]);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const realtimeRef = useRef(true);

  // Fetch runtime config (realtime flag) once
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        realtimeRef.current = !!cfg.realtime;
      })
      .catch(() => {});
  }, []);

  function sendChunk(blob: Blob) {
    if (!realtimeRef.current || !sessionIdRef.current) return;
    const form = new FormData();
    form.append('file', blob, 'chunk.pcm');
    fetch(`/api/realtime/chunk/${sessionIdRef.current}`, { method: 'POST', body: form });
  }

  function drawWave(level: number) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const base = w / 2 - 25;
    const radius = base + level * 25;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(79,140,255,0.8)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  function visualize() {
    if (!recordingRef.current) return;   // keep waveform inactive only when not recording
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyser || !dataArray) return;
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = dataArray[i] - 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / dataArray.length) / 128;
    drawWave(rms);
    rafRef.current = requestAnimationFrame(visualize);
  }

  async function startRecording() {
    console.log('startRecording');
    if (!sentence) return;
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    sampleRateRef.current = audioCtx.sampleRate;
    lastSend = 0;

    if (realtimeRef.current) {
      const fd = new FormData();
      fd.append('sentence', sentence);
      fd.append('sample_rate', String(audioCtx.sampleRate));
      fd.append('teacher_id', String(teacherId));
      fd.append('student_id', studentId);
      try {
        const r = await fetch('/api/realtime/start', { method: 'POST', body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail);
        sessionIdRef.current = j.session_id;
        fillerAudioRef.current = j.filler_audio;
        delayRef.current = j.delay_seconds;
      } catch (err) {
        setStatus('Fout: ' + (err instanceof Error ? err.message : String(err)));
        await audioCtx.close();
        audioCtxRef.current = null;
        return;
      }
    } else {
      sessionIdRef.current = null;
      fillerAudioRef.current = null;
      delayRef.current = 0;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('Fout: ' + message);
      await audioCtx.close();
      audioCtxRef.current = null;
      return;
    }
    streamRef.current = stream;

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    const dataArray = new Uint8Array(analyser.fftSize);
    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    try {
      await audioCtx.audioWorklet.addModule(
        `${import.meta.env.BASE_URL}pcm-worklet.js`,
      );
    } catch (err) {
      console.error('Error loading audio worklet module', err);
      setStatus(
        'Fout: ' + (err instanceof Error ? err.message : String(err)),
      );
      return;
    }
    const processor = new AudioWorkletNode(audioCtx, 'pcm-processor');
    processorRef.current = processor;
    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(audioCtx.destination);
    processor.port.onmessage = (e) => {
      if (!recordingRef.current) return;
      const pcm = e.data as Int16Array;
      recordedChunksRef.current.push(pcm);
      if (!realtimeRef.current) return;
      PCM_QUEUE.push(pcm);
      const now = performance.now();
      if (now - lastSend < SEND_INTERVAL_MS) return;
      lastSend = now;

      const total = PCM_QUEUE.reduce((n, c) => n + c.length, 0);
      const flat = new Int16Array(total);
      let pos = 0;
      for (const c of PCM_QUEUE) { flat.set(c, pos); pos += c.length; }
      PCM_QUEUE.length = 0;

      const blob = new Blob([flat], { type: 'application/octet-stream' });
      if (sessionIdRef.current && DEBUG) console.log('send chunk', blob.size, 'bytes');
      if (sessionIdRef.current) sendChunk(blob);
    };

    recordedChunksRef.current = [];
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
    recordingRef.current = true;
    setRecording(true);
    setStatus('Opnemen');
    visualize();
  }

  async function stopRecording() {
    console.log('stopRecording');
    recordingRef.current = false;
    setRecording(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    drawWave(0);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const sampleRate = sampleRateRef.current || 48000;
    await audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setStatus('Analyseren');
    if (realtimeRef.current) {
      if (PCM_QUEUE.length) {
        const total = PCM_QUEUE.reduce((n, c) => n + c.length, 0);
        const flat = new Int16Array(total);
        let pos = 0;
        for (const c of PCM_QUEUE) { flat.set(c, pos); pos += c.length; }
        PCM_QUEUE.length = 0;
        sendChunk(new Blob([flat], { type: 'application/octet-stream' }));
      }
      const stopPromise = fetch(`/api/realtime/stop/${sessionIdRef.current}`, { method: 'POST' }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail);
        return j as FeedbackData;
      });
      sessionIdRef.current = null;
      setTimeout(async () => {
        setStatus('Feedback afspelen');
        const filler = fillerAudioRef.current;
        if (filler) await new Promise((res) => {
          const a = new Audio('/api/audio/' + filler);
          a.onended = res;
          a.play();
        });
        let data: FeedbackData;
        try {
          data = await stopPromise;
        } catch (err) {
          setStatus('Fout: ' + (err as Error).message);
          return;
        }
        const total = recordedChunksRef.current.reduce((n, c) => n + c.length, 0);
        const flat = new Int16Array(total);
        let pos = 0;
        for (const c of recordedChunksRef.current) {
          flat.set(c, pos);
          pos += c.length;
        }
        const wav = encodeWav(flat, sampleRate);
        console.log('final wav blob', wav.size, 'bytes');
        const url = URL.createObjectURL(wav);
        setPlaybackUrl(url);
        onFeedback(data);
        setStatus('');
      }, delayRef.current * 1000);
      return;
    }

    // Offline mode: process the full recording in one request
    const total = recordedChunksRef.current.reduce((n, c) => n + c.length, 0);
    const flat = new Int16Array(total);
    let pos = 0;
    for (const c of recordedChunksRef.current) {
      flat.set(c, pos);
      pos += c.length;
    }
    const wav = encodeWav(flat, sampleRate);
    const fd = new FormData();
    fd.append('file', wav, 'audio.wav');
    fd.append('sentence', sentence);
    fd.append('teacher_id', String(teacherId));
    fd.append('student_id', studentId);
    let data: FeedbackData & { filler_audio: string; delay_seconds: number };
    try {
      const r = await fetch('/api/process', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail);
      data = j;
    } catch (err) {
      setStatus('Fout: ' + (err as Error).message);
      return;
    }
    const url = URL.createObjectURL(wav);
    setPlaybackUrl(url);
    setTimeout(async () => {
      setStatus('Feedback afspelen');
      if (data.filler_audio) {
        await new Promise((res) => {
          const a = new Audio('/api/audio/' + data.filler_audio);
          a.onended = res;
          a.play();
        });
      }
      const fb = new Audio('/api/audio/' + data.feedback_audio);
      await new Promise((res) => {
        fb.onended = res;
        fb.play();
      });
      onFeedback(data);
      setStatus('');
    }, (data.delay_seconds ?? 0) * 1000);
  }

  return {
    recording,
    status,
    playbackUrl,
    startRecording,
    stopRecording,
  };
}

function encodeWav(samples: Int16Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
  return new Blob([view], { type: 'audio/wav' });
}
