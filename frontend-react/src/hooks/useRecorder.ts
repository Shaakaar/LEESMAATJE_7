import { useEffect, useRef, useState } from "react";
import { RingBuffer } from "../utils/ringBuffer";

const SEND_INTERVAL_MS = 100; // how often to upload audio (in ms)
const DEBUG = false; // set true to enable chunk logs
const PCM_QUEUE: Int16Array[] = [];
let lastSend = 0;
const PRE_ROLL_SEC = 1.5;

const FILLER_AUDIO = "de_zin_was.wav";

export interface FeedbackData {
  feedback_text: string;
  feedback_audio: string;
  reference_text: string;
  is_correct: boolean;
  errors: {
    expected_word: string;
    heard_word?: string;
    issue: 'mispronunciation' | 'vowel' | 'consonant' | 'omission' | 'insertion';
    expected_phonemes?: string;
    heard_phonemes?: string;
    letter_errors?: unknown[];
  }[];
}

interface RecorderOptions {
  sentence: string;
  sentenceAudio?: string;
  teacherId: number;
  studentId: string;
  onFeedback: (data: FeedbackData) => void;
  canvas?: HTMLCanvasElement | null;
}

export function useRecorder({
  sentence,
  sentenceAudio,
  teacherId,
  studentId,
  onFeedback,
  canvas,
}: RecorderOptions) {
  const recordingRef = useRef(false); // for audio-thread guard
  const [recording, setRecording] = useState(false); // UI only
  const [status, setStatus] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sampleRateRef = useRef<number | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const delayRef = useRef<number>(0);
  const recordedChunksRef = useRef<Int16Array[]>([]);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const realtimeRef = useRef(true);
  const timelineRef = useRef<Record<string, number>>({});
  const ringRef = useRef<RingBuffer | null>(null);
  const backendReadyRef = useRef(false);

  function ensureRing(sampleRate: number) {
    const cap = Math.max(1, Math.round(sampleRate * PRE_ROLL_SEC));
    if (!ringRef.current || ringRef.current.capacity !== cap) {
      ringRef.current = new RingBuffer(cap);
    }
    return ringRef.current;
  }

  // Fetch runtime config (realtime flag) once
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        realtimeRef.current = !!cfg.realtime;
      })
      .catch(() => {});
  }, []);

  function sendChunk(blob: Blob) {
    if (!realtimeRef.current || !sessionIdRef.current) return;
    const form = new FormData();
    form.append("file", blob, "chunk.pcm");
    if (!("first_chunk_sent" in timelineRef.current))
      timelineRef.current.first_chunk_sent = performance.now();
    fetch(`/api/realtime/chunk/${sessionIdRef.current}`, {
      method: "POST",
      body: form,
    });
  }

  function drawWave(level: number) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const base = w / 2 - 25;
    const radius = base + level * 25;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(79,140,255,0.8)";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  function visualize() {
    if (!recordingRef.current) return; // keep waveform inactive only when not recording
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
    console.log("startRecording");
    if (!sentence) return;
    timelineRef.current = {};
    timelineRef.current.ui_click = performance.now();
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    sampleRateRef.current = audioCtx.sampleRate;
    const ring = ensureRing(sampleRateRef.current);
    timelineRef.current.ring_capacity_samples = ring.capacity;
    lastSend = 0;

    if (realtimeRef.current) {
      backendReadyRef.current = false;
      const fd = new FormData();
      fd.append("sentence", sentence);
      fd.append("sample_rate", String(audioCtx.sampleRate));
      fd.append("teacher_id", String(teacherId));
      fd.append("student_id", studentId);
      (async () => {
        try {
          timelineRef.current.start_req_sent = performance.now();
          const r = await fetch("/api/realtime/start", {
            method: "POST",
            body: fd,
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.detail);
          sessionIdRef.current = j.session_id;
          delayRef.current = j.delay_seconds;
          timelineRef.current.start_resp_ok = performance.now();
          backendReadyRef.current = true;
          const ring = ensureRing(sampleRateRef.current ?? audioCtx.sampleRate);
          const preload = ring.drainAll();
          const ms =
            (preload.length / (sampleRateRef.current ?? audioCtx.sampleRate)) *
            1000;
          timelineRef.current.ring_capacity_samples = ring.capacity;
          timelineRef.current.ring_preload_samples_sent = preload.length;
          timelineRef.current.ring_preload_ms = ms;
          if (preload.length)
            sendChunk(new Blob([preload], { type: "application/octet-stream" }));
          console.log(
            `Frontend: preload_sent_ms=${ms.toFixed(1)}, samples=${preload.length}`,
          );
        } catch (err) {
          console.error("start failed", err);
          setStatus(
            "Fout: " + (err instanceof Error ? err.message : String(err)),
          );
          recordingRef.current = false;
          setRecording(false);
          processorRef.current?.disconnect();
          streamRef.current?.getTracks().forEach((t) => t.stop());
          await audioCtxRef.current?.close();
          audioCtxRef.current = null;
          ringRef.current?.clear();
        }
      })();
    } else {
      sessionIdRef.current = null;
      delayRef.current = 0;
      backendReadyRef.current = true;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      timelineRef.current.mic_ready = performance.now();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("Fout: " + message);
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
      timelineRef.current.worklet_loaded = performance.now();
    } catch (err) {
      console.error("Error loading audio worklet module", err);
      setStatus("Fout: " + (err instanceof Error ? err.message : String(err)));
      return;
    }
    const processor = new AudioWorkletNode(audioCtx, "pcm-processor");
    processorRef.current = processor;
    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(audioCtx.destination);
    timelineRef.current.processor_ready = performance.now();
    processor.port.onmessage = (e) => {
      if (!recordingRef.current) return;
      const pcm = e.data as Int16Array;
      if (!("first_chunk_captured" in timelineRef.current))
        timelineRef.current.first_chunk_captured = performance.now();
      recordedChunksRef.current.push(pcm);
      if (!realtimeRef.current) return;
      if (!backendReadyRef.current) {
        const sr = sampleRateRef.current ?? 16000;
        const ring = ensureRing(sr);
        ring.write(pcm);
        return;
      }
      PCM_QUEUE.push(pcm);
      const now = performance.now();
      if (now - lastSend < SEND_INTERVAL_MS) return;
      lastSend = now;

      const total = PCM_QUEUE.reduce((n, c) => n + c.length, 0);
      const flat = new Int16Array(total);
      let pos = 0;
      for (const c of PCM_QUEUE) {
        flat.set(c, pos);
        pos += c.length;
      }
      PCM_QUEUE.length = 0;

      const blob = new Blob([flat], { type: "application/octet-stream" });
      if (sessionIdRef.current && DEBUG)
        console.log("send chunk", blob.size, "bytes");
      if (sessionIdRef.current) sendChunk(blob);
    };

    recordedChunksRef.current = [];
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
    recordingRef.current = true;
    setRecording(true);
    setStatus("Opnemen");
    visualize();
  }

  async function stopRecording() {
    console.log("stopRecording");
    recordingRef.current = false;
    setRecording(false);
    backendReadyRef.current = false;
    ringRef.current?.clear();
    ringRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    drawWave(0);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const sampleRate = sampleRateRef.current ?? 48000;
    await audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setStatus("Analyseren");
    if (realtimeRef.current) {
      if (PCM_QUEUE.length) {
        const total = PCM_QUEUE.reduce((n, c) => n + c.length, 0);
        const flat = new Int16Array(total);
        let pos = 0;
        for (const c of PCM_QUEUE) {
          flat.set(c, pos);
          pos += c.length;
        }
        PCM_QUEUE.length = 0;
        sendChunk(new Blob([flat], { type: "application/octet-stream" }));
      }
      const stopPromise = fetch(`/api/realtime/stop/${sessionIdRef.current}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_timeline: timelineRef.current }),
      }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail);
        return j as FeedbackData;
      });
      sessionIdRef.current = null;
      setTimeout(async () => {
        setStatus("Feedback afspelen");
        await new Promise((res) => {
          const a = new Audio("/api/audio/" + FILLER_AUDIO);
          a.onended = res;
          a.play();
        });
        if (sentenceAudio)
          await new Promise((res) => {
            const a = new Audio("/api/audio/" + sentenceAudio);
            a.onended = res;
            a.play();
          });
        let data: FeedbackData;
        try {
          data = await stopPromise;
        } catch (err) {
          setStatus("Fout: " + (err as Error).message);
          return;
        }
        const total = recordedChunksRef.current.reduce(
          (n, c) => n + c.length,
          0,
        );
        const flat = new Int16Array(total);
        let pos = 0;
        for (const c of recordedChunksRef.current) {
          flat.set(c, pos);
          pos += c.length;
        }
        const wav = encodeWav(flat, sampleRate);
        console.log("final wav blob", wav.size, "bytes");
        const url = URL.createObjectURL(wav);
        setPlaybackUrl(url);
        const fb = new Audio("/api/audio/" + data.feedback_audio);
        onFeedback(data);
        fb.onended = () => setStatus("");
        fb.play();
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
    fd.append("file", wav, "audio.wav");
    fd.append("sentence", sentence);
    fd.append("teacher_id", String(teacherId));
    fd.append("student_id", studentId);
    let data: FeedbackData & { delay_seconds: number };
    try {
      const r = await fetch("/api/process", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail);
      data = j;
    } catch (err) {
      setStatus("Fout: " + (err as Error).message);
      return;
    }
    const url = URL.createObjectURL(wav);
    setPlaybackUrl(url);
    setTimeout(
        async () => {
          setStatus("Feedback afspelen");
          await new Promise((res) => {
            const a = new Audio("/api/audio/" + FILLER_AUDIO);
            a.onended = res;
            a.play();
          });
          if (sentenceAudio)
            await new Promise((res) => {
              const a = new Audio("/api/audio/" + sentenceAudio);
              a.onended = res;
              a.play();
            });
          const fb = new Audio("/api/audio/" + data.feedback_audio);
          onFeedback(data);
          fb.onended = () => setStatus("");
          fb.play();
        },
      (data.delay_seconds ?? 0) * 1000,
    );
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
    for (let i = 0; i < str.length; i++)
      view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    view.setInt16(44 + i * 2, samples[i], true);
  return new Blob([view], { type: "audio/wav" });
}
