import { useState, useRef, useCallback } from 'react';

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

export interface RecorderResult {
  correct?: boolean;
  feedback_audio: string;
}

export function useRecorder(
  sentence: string | null,
  teacherId: string | null,
  studentId: string | null
) {
  const [state, setState] = useState<'idle' | 'recording' | 'analysing'>('idle');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [result, setResult] = useState<RecorderResult | null>(null);

  const audioCtx = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const dataArray = useRef<Uint8Array | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startPromise = useRef<Promise<void> | null>(null);
  const sessionId = useRef<string | null>(null);
  const fillerAudio = useRef<string | null>(null);
  const delaySeconds = useRef(0);
  const pendingChunks = useRef<Blob[]>([]);
  const chunks = useRef<Int16Array[]>([]);


  const start = useCallback(async () => {
    if (!sentence) return;
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx.current = new AudioContext();
    const fd = new FormData();
    fd.append('sentence', sentence);
    fd.append('sample_rate', String(audioCtx.current.sampleRate));
    if (teacherId) fd.append('teacher_id', teacherId);
    if (studentId) fd.append('student_id', studentId);

    startPromise.current = fetch('/api/realtime/start', { method: 'POST', body: fd })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail);
        sessionId.current = j.session_id;
        fillerAudio.current = j.filler_audio;
        delaySeconds.current = j.delay_seconds;
        for (const b of pendingChunks.current) {
          const f = new FormData();
          f.append('file', b, 'chunk.pcm');
          fetch('/api/realtime/chunk/' + sessionId.current, { method: 'POST', body: f });
        }
        pendingChunks.current = [];
      })
      .catch((err) => {
        console.error(err);
        setState('idle');
      })
      .finally(() => {
        startPromise.current = null;
      });

    const source = audioCtx.current.createMediaStreamSource(stream.current);
    analyser.current = audioCtx.current.createAnalyser();
    analyser.current.fftSize = 512;
    dataArray.current = new Uint8Array(analyser.current.fftSize);
    processor.current = audioCtx.current.createScriptProcessor(4096, 1, 1);
    source.connect(analyser.current);
    analyser.current.connect(processor.current);
    processor.current.connect(audioCtx.current.destination);
    processor.current.onaudioprocess = (e) => {
      if (state !== 'recording') return;
      const buf = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(buf.length);
      for (let i = 0; i < buf.length; i++) {
        const sample = Math.max(-1, Math.min(1, buf[i]));
        pcm[i] = sample * 32767;
      }
      chunks.current.push(pcm);
      const blob = new Blob([pcm], { type: 'application/octet-stream' });
      if (sessionId.current) {
        const f = new FormData();
        f.append('file', blob, 'chunk.pcm');
        fetch('/api/realtime/chunk/' + sessionId.current, { method: 'POST', body: f });
      } else {
        pendingChunks.current.push(blob);
      }
    };
    chunks.current = [];
    setState('recording');
  }, [sentence, teacherId, studentId, state]);

  const stop = useCallback(async () => {
    if (state !== 'recording') return;
    setState('analysing');
    processor.current?.disconnect();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (startPromise.current) {
      try {
        await startPromise.current;
      } catch {
        return;
      }
    }
    const stopPromise = fetch('/api/realtime/stop/' + sessionId.current, { method: 'POST' }).then(
      async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail);
        return j as RecorderResult;
      }
    );
    sessionId.current = null;
    setTimeout(async () => {
      if (fillerAudio.current) new Audio('/api/audio/' + fillerAudio.current).play();
      let data: RecorderResult;
      try {
        data = await stopPromise;
      } catch (err) {
        console.error(err);
        setState('idle');
        return;
      }
      const total = chunks.current.reduce((n, c) => n + c.length, 0);
      const flat = new Int16Array(total);
      let pos = 0;
      for (const c of chunks.current) {
        flat.set(c, pos);
        pos += c.length;
      }
      const wav = encodeWav(flat, audioCtx.current!.sampleRate);
      setPlaybackUrl(URL.createObjectURL(wav));
      setResult(data);
      setState('idle');
    }, delaySeconds.current * 1000);
  }, [state]);

  const level = useCallback(() => {
    if (!analyser.current || !dataArray.current) return 0;
    analyser.current.getByteTimeDomainData(dataArray.current);
    let sum = 0;
    for (let i = 0; i < dataArray.current.length; i++) {
      const val = dataArray.current[i] - 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / dataArray.current.length) / 128;
    return rms;
  }, []);

  const reset = useCallback(() => {
    setPlaybackUrl(null);
    setResult(null);
  }, []);

  return { state, start, stop, playbackUrl, result, level, reset };
}
