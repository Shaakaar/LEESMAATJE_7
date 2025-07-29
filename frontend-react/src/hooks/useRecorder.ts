import { useCallback, useRef, useState } from 'react';
import { encodeWav } from '@/lib/wav';

interface FeedbackData {
  feedback_text: string;
  feedback_audio: string;
  correct?: boolean;
  errors?: unknown[];
}

export function useRecorder(studentId: string | null, teacherId: number | null) {
  const [isRecording, setIsRecording] = useState(false);
  const [waveLevel, setWaveLevel] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<FeedbackData | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  const audioCtx = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const dataArray = useRef<Uint8Array | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>();
  const sessionId = useRef<string | null>(null);
  const startPromise = useRef<Promise<void> | null>(null);
  const fillerAudio = useRef<string | null>(null);
  const delaySeconds = useRef<number>(0);
  const recorded = useRef<Int16Array[]>([]);
  const pendingChunks = useRef<Blob[]>([]);

  const visualize = useCallback(() => {
    if (!isRecording) return;
    if (analyser.current && dataArray.current) {
      analyser.current.getByteTimeDomainData(dataArray.current);
      let sum = 0;
      for (const v of dataArray.current) {
        const val = v - 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.current.length) / 128;
      setWaveLevel(rms);
    }
    raf.current = requestAnimationFrame(visualize);
  }, [isRecording]);

  const start = useCallback(async (sentence: string) => {
    if (!sentence || isRecording) return;
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx.current = new AudioContext();
    const source = audioCtx.current.createMediaStreamSource(stream.current);
    analyser.current = audioCtx.current.createAnalyser();
    analyser.current.fftSize = 512;
    dataArray.current = new Uint8Array(analyser.current.fftSize);
    processor.current = audioCtx.current.createScriptProcessor(4096, 1, 1);
    source.connect(analyser.current);
    analyser.current.connect(processor.current);
    processor.current.connect(audioCtx.current.destination);
    recorded.current = [];
    processor.current.onaudioprocess = (e) => {
      if (!isRecording) return;
      const buf = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(buf.length);
      for (let i = 0; i < buf.length; i++) {
        const s = Math.max(-1, Math.min(1, buf[i]));
        pcm[i] = s * 32767;
      }
      recorded.current.push(pcm);
      const blob = new Blob([pcm], { type: 'application/octet-stream' });
      if (sessionId.current) {
        const f = new FormData();
        f.append('file', blob, 'chunk.pcm');
        fetch('/api/realtime/chunk/' + sessionId.current, { method: 'POST', body: f });
      } else {
        pendingChunks.current.push(blob);
      }
    };

    const fd = new FormData();
    fd.append('sentence', sentence);
    fd.append('sample_rate', String(audioCtx.current.sampleRate));
    fd.append('teacher_id', String(teacherId ?? 0));
    fd.append('student_id', studentId ?? '');

    startPromise.current = fetch('/api/realtime/start', { method: 'POST', body: fd })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail);
        sessionId.current = j.session_id;
        fillerAudio.current = j.filler_audio;
        delaySeconds.current = j.delay_seconds;
        for (const blob of pendingChunks.current) {
          const f = new FormData();
          f.append('file', blob, 'chunk.pcm');
          fetch('/api/realtime/chunk/' + sessionId.current, { method: 'POST', body: f });
        }
        pendingChunks.current = [];
      })
      .catch((err) => {
        setLastFeedback({ feedback_text: 'Fout: ' + err.message, feedback_audio: '' });
        setIsRecording(false);
      })
      .finally(() => {
        startPromise.current = null;
      });

    setIsRecording(true);
    setWaveLevel(0);
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
    setLastFeedback(null);
    visualize();
  }, [isRecording, playbackUrl, studentId, teacherId, visualize]);

  const stop = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    processor.current?.disconnect();
    stream.current?.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(raf.current ?? 0);
    setWaveLevel(0);

    if (startPromise.current) {
      try {
        await startPromise.current;
      } catch {
        return;
      }
    }

    const stopPromise = fetch('/api/realtime/stop/' + sessionId.current, {
      method: 'POST',
    }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail);
      return j as FeedbackData;
    });
    sessionId.current = null;

    await new Promise((res) => setTimeout(res, delaySeconds.current * 1000));
    if (fillerAudio.current) {
      await new Promise<void>((res) => {
        const a = new Audio('/api/audio/' + fillerAudio.current!);
        a.onended = () => res();
        a.play();
      });
    }

    let data: FeedbackData;
    try {
      data = await stopPromise;
    } catch (err) {
      setLastFeedback({ feedback_text: 'Fout: ' + (err as Error).message, feedback_audio: '' });
      return;
    }

    const total = recorded.current.reduce((n, c) => n + c.length, 0);
    const flat = new Int16Array(total);
    let pos = 0;
    for (const c of recorded.current) {
      flat.set(c, pos);
      pos += c.length;
    }
    if (audioCtx.current) {
      const wav = encodeWav(flat, audioCtx.current.sampleRate);
      const url = URL.createObjectURL(wav);
      setPlaybackUrl(url);
    }
    recorded.current = [];
    fillerAudio.current = null;
    setLastFeedback(data);
  }, [isRecording]);

  const replayFeedback = useCallback(() => {
    if (lastFeedback?.feedback_audio) {
      new Audio('/api/audio/' + lastFeedback.feedback_audio).play();
    }
  }, [lastFeedback]);

  const playRecording = useCallback(() => {
    if (playbackUrl) {
      new Audio(playbackUrl).play();
    }
  }, [playbackUrl]);

  const reset = useCallback(() => {
    setLastFeedback(null);
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
  }, [playbackUrl]);

  return {
    start,
    stop,
    replayFeedback,
    playRecording,
    reset,
    isRecording,
    waveLevel,
    lastFeedback,
    playbackUrl,
  } as const;
}
