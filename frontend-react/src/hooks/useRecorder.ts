import { useEffect, useRef, useState } from "react";
import { RingBuffer } from "../utils/ringBuffer";

const SEND_INTERVAL_MS = 100; // how often to upload audio (in ms)
const DEBUG = false; // set true to enable chunk logs
const PCM_QUEUE: Int16Array[] = [];
let lastSend = 0;
const PREBUFFER_MAX_MS = 10000; // safety cap, 10s
type RecState = "idle" | "starting" | "streaming" | "stopping";

const FILLER_AUDIO = "de_zin_was.wav";

type AudioHandle = HTMLAudioElement;
const audioCache = new Map<string, AudioHandle>();
const audioReady = new Set<string>();
const audioReadyPromises = new Map<string, Promise<void>>();

function getAudioEl(name: string): AudioHandle {
  let h = audioCache.get(name);
  if (!h) {
    h = new Audio(`/api/audio/${name}`);
    h.preload = "auto";
    audioCache.set(name, h);
  }
  return h;
}

function preloadAudio(name: string): Promise<void> {
  if (audioReady.has(name)) return Promise.resolve();
  let p = audioReadyPromises.get(name);
  if (!p) {
    const el = getAudioEl(name);
    p = new Promise<void>((res) => {
      const done = () => {
        el.removeEventListener("canplaythrough", done);
        audioReady.add(name);
        res();
      };
      if (el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) done();
      else el.addEventListener("canplaythrough", done, { once: true });
    });
    audioReadyPromises.set(name, p);
  }
  return p;
}

export function preloadAudios(names: string[]): Promise<void[]> {
  return Promise.all(names.map(preloadAudio));
}

async function playSequentially(
  items: { handle: AudioHandle; log: string }[],
  active: Set<AudioHandle>,
  signal?: AbortSignal,
): Promise<void> {
  for (const { handle, log } of items) {
    if (signal?.aborted) return;
    console.log(log);
    handle.currentTime = 0;
    active.add(handle);
    await handle.play().catch(() => {});
    await new Promise<void>((res) => {
      const done = () => {
        handle.removeEventListener("ended", done);
        signal?.removeEventListener("abort", abort);
        active.delete(handle);
        res();
      };
      const abort = () => {
        handle.removeEventListener("ended", done);
        signal?.removeEventListener("abort", abort);
        active.delete(handle);
        res();
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      handle.addEventListener("ended", done, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
}

function stopAllAudio(active: Set<AudioHandle>) {
  active.forEach((a) => {
    a.pause();
    a.currentTime = 0;
  });
  if (typeof document !== "undefined")
    document.querySelectorAll("audio").forEach((el) => {
      (el as HTMLAudioElement).pause();
      (el as HTMLAudioElement).currentTime = 0;
    });
  active.clear();
}

export interface FeedbackData {
  feedback_text: string;
  feedback_audio: string;
  errors?: { word?: string; expected_word?: string }[];
  correct?: boolean;
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
  const recStateRef = useRef<RecState>("idle");
  const tRecordClickRef = useRef(0);
  const startPromiseRef = useRef<Promise<string> | null>(null);
  const pendingStopRef = useRef(false);
  const activeAudiosRef = useRef<Set<AudioHandle>>(new Set());
  const preRollAbortRef = useRef<AbortController | null>(null);
  const preRollPlayingRef = useRef(false);
  const pendingFeedbackRef = useRef<(() => void) | null>(null);

  function ensureRing(sampleRate: number) {
    const cap = Math.max(
      1,
      Math.round((sampleRate * PREBUFFER_MAX_MS) / 1000),
    );
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

  useEffect(() => {
    const activeSet = activeAudiosRef.current;
    return () => {
      preRollAbortRef.current?.abort();
      stopAllAudio(activeSet);
    };
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
    preRollAbortRef.current?.abort();
    stopAllAudio(activeAudiosRef.current);
    preRollPlayingRef.current = false;
    pendingFeedbackRef.current = null;
    if (!sentence) return;
    timelineRef.current = {};
    timelineRef.current.ui_click = performance.now();
    recStateRef.current = "starting";
    pendingStopRef.current = false;
    tRecordClickRef.current = performance.now();
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    sampleRateRef.current = audioCtx.sampleRate;
    const ring = ensureRing(sampleRateRef.current);
    timelineRef.current.ring_capacity_samples = ring.capacity;
    lastSend = 0;

    if (realtimeRef.current) {
      const fd = new FormData();
      fd.append("sentence", sentence);
      fd.append("sample_rate", String(audioCtx.sampleRate));
      fd.append("teacher_id", String(teacherId));
      fd.append("student_id", studentId);
      startPromiseRef.current = (async () => {
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
          const sr = sampleRateRef.current ?? audioCtx.sampleRate;
          const ring = ensureRing(sr);
          const prebufferMs = Math.min(
            performance.now() - tRecordClickRef.current,
            PREBUFFER_MAX_MS,
          );
          const prebufferSamples = Math.floor((prebufferMs * sr) / 1000);
          const preload = ring.readLast(prebufferSamples);
          ring.clear();
          timelineRef.current.prebuffer_samples_sent = preload.length;
          timelineRef.current.prebuffer_ms = prebufferMs;
          if (preload.length)
            sendChunk(new Blob([preload], { type: "application/octet-stream" }));
          console.log(
            `Frontend: preload_sent_ms=${prebufferMs.toFixed(1)}, samples=${preload.length}`,
          );
          recStateRef.current = "streaming";
          if (pendingStopRef.current) {
            pendingStopRef.current = false;
            stopRecording();
          }
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
          recStateRef.current = "idle";
        }
        return sessionIdRef.current ?? "";
      })();
    } else {
      sessionIdRef.current = null;
      delayRef.current = 0;
      recStateRef.current = "streaming";
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
      if (recStateRef.current === "starting") {
        const sr = sampleRateRef.current ?? 16000;
        const ring = ensureRing(sr);
        ring.write(pcm);
        return;
      }
      if (recStateRef.current !== "streaming") return;
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

  function startPreRoll() {
    preRollAbortRef.current?.abort();
    stopAllAudio(activeAudiosRef.current);
    const ac = new AbortController();
    preRollAbortRef.current = ac;
    preRollPlayingRef.current = true;
    console.log("PREROLL start");
    setStatus("Feedback afspelen");
    const waiters = [preloadAudio(FILLER_AUDIO)];
    if (sentenceAudio) waiters.push(preloadAudio(sentenceAudio));
    Promise.all(waiters).then(() => {
      if (ac.signal.aborted) {
        preRollPlayingRef.current = false;
        return;
      }
      const seq: { handle: AudioHandle; log: string }[] = [
        { handle: getAudioEl(FILLER_AUDIO), log: "PREROLL filler.play" },
      ];
      if (sentenceAudio)
        seq.push({
          handle: getAudioEl(sentenceAudio),
          log: "PREROLL reference.play",
        });
      playSequentially(seq, activeAudiosRef.current, ac.signal).finally(() => {
        preRollPlayingRef.current = false;
        console.log("PREROLL done");
        const fn = pendingFeedbackRef.current;
        pendingFeedbackRef.current = null;
        if (fn) fn();
      });
    });
  }

  async function stopRecording() {
    console.log("stopRecording");
    if (recStateRef.current === "starting") {
      pendingStopRef.current = true;
      return;
    }
    if (recStateRef.current !== "streaming") return;
    recStateRef.current = "stopping";
    recordingRef.current = false;
    setRecording(false);
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

    let feedbackPromise: Promise<FeedbackData>;
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
      feedbackPromise = fetch(`/api/realtime/stop/${sessionIdRef.current}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_timeline: timelineRef.current }),
      }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail);
        console.log("STOP json_ready");
        return j as FeedbackData;
      });
      sessionIdRef.current = null;
    } else {
      const total = recordedChunksRef.current.reduce((n, c) => n + c.length, 0);
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
      const fd = new FormData();
      fd.append("file", wav, "audio.wav");
      fd.append("sentence", sentence);
      fd.append("teacher_id", String(teacherId));
      fd.append("student_id", studentId);
      feedbackPromise = fetch("/api/process", { method: "POST", body: fd }).then(
        async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.detail);
          console.log("STOP json_ready");
          return j as FeedbackData & { delay_seconds: number };
        },
      );
    }

    startPreRoll();

    feedbackPromise
      .then((data) => {
        if (realtimeRef.current) {
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
        }
        onFeedback(data);
        const fb = getAudioEl(data.feedback_audio);
        fb.onended = () => {
          activeAudiosRef.current.delete(fb);
          setStatus("");
        };
        const playFb = () => {
          console.log("FEEDBACK play_start");
          fb.currentTime = 0;
          activeAudiosRef.current.add(fb);
          fb.play().catch(() => {});
        };
        if (preRollPlayingRef.current) pendingFeedbackRef.current = playFb;
        else playFb();
      })
      .catch((err) => {
        const showErr = () =>
          setStatus(
            "Fout: " + (err instanceof Error ? err.message : String(err)),
          );
        if (preRollPlayingRef.current) pendingFeedbackRef.current = showErr;
        else showErr();
      });

    recStateRef.current = "idle";
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
