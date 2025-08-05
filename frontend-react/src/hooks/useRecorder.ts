import { useRef, useState } from 'react';

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
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const fillerAudioRef = useRef<string | null>(null);
  const delayRef = useRef<number>(0);
  const pendingChunksRef = useRef<Blob[]>([]);
  const recordedChunksRef = useRef<Int16Array[]>([]);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  function sendChunk(blob: Blob) {
    console.log('uploading chunk', blob.size, 'bytes');
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
    console.log('startRecording called');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('Fout: ' + message);
      return;
    }
    streamRef.current = stream;
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    console.log('microphone ready at', audioCtx.sampleRate, 'Hz');

    const fd = new FormData();
    fd.append('sentence', sentence);
    fd.append('sample_rate', String(audioCtx.sampleRate));
    fd.append('teacher_id', String(teacherId));
    fd.append('student_id', studentId);

    pendingChunksRef.current = [];
    startPromiseRef.current = fetch('/api/realtime/start', { method: 'POST', body: fd })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail);
        sessionIdRef.current = j.session_id;
        fillerAudioRef.current = j.filler_audio;
        delayRef.current = j.delay_seconds;
        for (const blob of pendingChunksRef.current) sendChunk(blob);
        pendingChunksRef.current = [];
      })
      .catch((err) => {
        setStatus('Fout: ' + err.message);
        setRecording(false);
      })
      .finally(() => {
        startPromiseRef.current = null;
      });

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
      console.log('Audio worklet module loaded');
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
    console.log('Setting processor port message handler');
    processor.port.onmessage = (e) => {
      if (!recordingRef.current) return;
      const pcm = e.data as Int16Array;
      recordedChunksRef.current.push(pcm);
      const blob = new Blob([pcm], { type: 'application/octet-stream' });
      console.log('created chunk', blob.size, 'bytes');
      if (sessionIdRef.current) {
        sendChunk(blob);
      } else {
        console.log('queued chunk', blob.size, 'bytes');
        pendingChunksRef.current.push(blob);
      }
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
    console.log('stopRecording called');
    recordingRef.current = false;
    setRecording(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    drawWave(0);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStatus('Analyseren');

    if (startPromiseRef.current) {
      try {
        await startPromiseRef.current;
      } catch {
        return;
      }
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
      console.log('flushing', recordedChunksRef.current.length, 'chunks totalling', total * 2, 'bytes');
      const flat = new Int16Array(total);
      let pos = 0;
      for (const c of recordedChunksRef.current) {
        flat.set(c, pos);
        pos += c.length;
      }
      const wav = encodeWav(flat, audioCtxRef.current!.sampleRate);
      console.log('final wav blob', wav.size, 'bytes');
      const url = URL.createObjectURL(wav);
      setPlaybackUrl(url);
      onFeedback(data);
      setStatus('');
    }, delayRef.current * 1000);
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
