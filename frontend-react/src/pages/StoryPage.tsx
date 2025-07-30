import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { Progress } from '@/components/ui/progress';

interface StorySentence {
  type: 'sentence';
  text: string;
  audio: string;
  words?: string[];
}
interface StoryDirection {
  type: 'direction';
  text: string;
  audio: string;
}
type StoryItem = StorySentence | StoryDirection;

export default function StoryPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const studentId = params.get('student_id');
  const teacherId = parseInt(params.get('teacher_id') || '0', 10) || 0;
  const studentName = params.get('name');
  const devMode = params.has('dev');

  const [storyData, setStoryData] = useState<StoryItem[]>(() => {
    const raw = localStorage.getItem('story_data');
    return raw ? JSON.parse(raw) : [];
  });
  const theme = localStorage.getItem('theme');
  const level = localStorage.getItem('level');
  const [index, setIndex] = useState(0);
  const [selectedDir, setSelectedDir] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [sentence, setSentence] = useState('');
  const [status, setStatus] = useState('');
  const [feedbackHtml, setFeedbackHtml] = useState('');
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackPositive, setFeedbackPositive] = useState(true);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [lastFeedbackAudio, setLastFeedbackAudio] = useState<string | null>(null);

  const audioCtx = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const dataArray = useRef<Uint8Array | null>(null);
  const sessionId = useRef<string | null>(null);
  const fillerAudio = useRef<string | null>(null);
  const delaySeconds = useRef<number>(0);
  const recorded = useRef<Int16Array[]>([]);
  const pendingChunks = useRef<Blob[]>([]);
  const startPromise = useRef<Promise<void> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [recording, setRecording] = useState(false);

  const showSentence = () => {
    const item = storyData[index];
    if (!item) {
      setSentence('');
      return;
    }
    setSelectedDir(null);
    setFeedbackVisible(false);

    if (
      item.type === 'direction' &&
      storyData[index + 1] &&
      storyData[index + 1].type === 'direction'
    ) {
      setSentence('');
      setProgress(((index + 2) / storyData.length) * 100);
    } else {
      setSentence(item.text);
      setProgress(((index + 1) / storyData.length) * 100);
    }
  };

  useEffect(() => {
    if (!storyData.length || !studentId) {
      navigate('/');
      return;
    }
    showSentence();
    // cleanup on unmount
    return () => {
      playbackUrl && URL.revokeObjectURL(playbackUrl);
    };
  }, [index, storyData]);

  const playAudio = (url: string, cb?: () => void) => {
    const a = new Audio(url);
    if (cb) a.onended = cb;
    a.play();
  };

  const startVisualizer = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser.current) return;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      if (!recording || !analyser.current) return;
      analyser.current.getByteTimeDomainData(dataArray.current!);
      let sum = 0;
      for (let i = 0; i < dataArray.current!.length; i++) {
        const val = dataArray.current![i] - 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.current!.length) / 128;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const base = w / 2 - 25;
      const radius = base + rms * 25;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(79,140,255,0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();
      requestAnimationFrame(draw);
    };
    draw();
  };

  const stopVisualizer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const startRecording = async () => {
    if (!sentence) return;
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx.current = new AudioContext();
    const fd = new FormData();
    fd.append('sentence', sentence);
    fd.append('sample_rate', String(audioCtx.current.sampleRate));
    fd.append('teacher_id', String(teacherId));
    fd.append('student_id', String(studentId));
    pendingChunks.current = [];
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
        setStatus('Fout: ' + err.message);
        setRecording(false);
        stopVisualizer();
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
      if (!recording) return;
      const buf = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(buf.length);
      for (let i = 0; i < buf.length; i++) {
        let s = Math.max(-1, Math.min(1, buf[i]));
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
    recorded.current = [];
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
    setRecording(true);
    setStatus('Opnemen');
    startVisualizer();
  };

  const stopRecording = async () => {
    setRecording(false);
    stopVisualizer();
    processor.current?.disconnect();
    stream.current?.getTracks().forEach((t) => t.stop());
    setStatus('Analyseren');
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
        if (!r.ok) {
          setStatus('Fout: ' + j.detail);
          throw new Error(j.detail);
        }
        return j;
      }
    );
    sessionId.current = null;
    setTimeout(async () => {
      setStatus('Feedback afspelen');
      playAudio('/api/audio/' + fillerAudio.current!, async () => {
        let data;
        try {
          data = await stopPromise;
        } catch (err: any) {
          setStatus('Fout: ' + err.message);
          return;
        }
        const total = recorded.current.reduce((n, c) => n + c.length, 0);
        const flat = new Int16Array(total);
        let pos = 0;
        for (const c of recorded.current) {
          flat.set(c, pos);
          pos += c.length;
        }
        const wav = encodeWav(flat, audioCtx.current!.sampleRate);
        const url = URL.createObjectURL(wav);
        setPlaybackUrl(url);
        showFeedback(data);
        setStatus('');
      });
    }, delaySeconds.current * 1000);
  };

  const encodeWav = (samples: Int16Array, sampleRate: number) => {
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
  };

  const showFeedback = (data: any) => {
    const html = data.feedback_text.replace(/\*\*(.*?)\*\*/g, '<strong class="highlight">$1</strong>');
    setFeedbackHtml(html);
    setFeedbackVisible(true);
    const negative = typeof data.correct === 'boolean' ? !data.correct : /opnieuw|niet gehoord|again|wrong/i.test(data.feedback_text);
    setFeedbackPositive(!negative);
    setLastFeedbackAudio(data.feedback_audio);
    playAudio('/api/audio/' + data.feedback_audio);
  };

  const onReplay = () => {
    if (lastFeedbackAudio) playAudio('/api/audio/' + lastFeedbackAudio);
  };

  const onNext = async () => {
    const item = storyData[index];
    if (item && item.type === 'direction') {
      if (selectedDir === null) return;
      const choice = selectedDir === 0 ? item.text : (storyData[index + 1] as StoryDirection).text;
      const url = `/api/continue_story?theme=${theme}&level=${level}&direction=${encodeURIComponent(choice)}`;
      const ev = new EventSource(url);
      const newData: StoryItem[] = [];
      ev.addEventListener('sentence', (e) => {
        newData.push({ type: 'sentence', ...(JSON.parse((e as MessageEvent).data)) });
      });
      ev.addEventListener('direction', (e) => {
        newData.push({ type: 'direction', ...(JSON.parse((e as MessageEvent).data)) });
      });
      ev.addEventListener('progress', (e) => {
        setProgress(parseFloat((e as MessageEvent).data) * 100);
      });
      await new Promise((res) => ev.addEventListener('complete', () => { ev.close(); res(null); }));
      setStoryData((d) => {
        const copy = d.slice();
        copy.splice(index, 2, ...newData);
        return copy;
      });
      showSentence();
    } else {
      setIndex((i) => (i + 1) % storyData.length);
    }
  };

  const onPrev = () => {
    setIndex((i) => (i - 1 + storyData.length) % storyData.length);
  };

  useEffect(() => {
    if (recording) startVisualizer();
  }, [recording]);

  if (!storyData.length || !studentId) return null;

  return (
    <AppShell>
      <div className="space-y-4 max-w-xl w-full">
        <div className="flex items-center mb-2">
          <h1 className="font-display font-bold tracking-[-0.5px] text-2xl text-primary flex-1 text-left">
            Leesmaatje
          </h1>
          <span className="flex-1 text-center">{studentName}</span>
          <button
            onClick={() => navigate('/')}
            className="ml-auto bg-accent text-slate-900 px-4 py-2 rounded-md"
          >
            Uitloggen
          </button>
        </div>
        <label className="font-semibold block text-left" htmlFor="sentence">
          Zin om te lezen:
        </label>
        <div id="sentence" className="bg-white shadow rounded-xl p-4 text-2xl min-h-[3rem]">
          {sentence && (
            <p>
              {sentence.split(' ').map((w, i) => (
                <span
                  key={i}
                  className="word cursor-pointer hover:text-primary"
                  onClick={() => playAudio('/api/audio/' + (storyData[index] as any).words?.[i])}
                >
                  {w + ' '}
                </span>
              ))}
              {(storyData[index] as any).audio && (
                <button
                  className="play-sent ml-2"
                  onClick={() => playAudio('/api/audio/' + (storyData[index] as any).audio)}
                >
                  🔊
                </button>
              )}
            </p>
          )}
        </div>
        <Progress value={progress} />
        <div className="text-sm font-semibold">{index + 1}/{storyData.length}</div>
        <div id="status" className="font-bold">
          {status}
        </div>
        <div className="flex justify-center mt-4">
          <div className={`relative w-[150px] h-[150px] flex items-center justify-center ${recording ? 'recording' : ''}`}>
            <canvas ref={canvasRef} width={150} height={150} className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${recording ? 'opacity-100' : 'opacity-0'}`} />
            <button
              onClick={() => (recording ? stopRecording() : startRecording())}
              className="w-[120px] h-[120px] rounded-full flex flex-col items-center justify-center bg-primary text-white"
            >
              <span className="text-3xl">🎤</span>
              <span className="label hidden">Opnemen</span>
            </button>
          </div>
        </div>
        {playbackUrl && (
          <div className="flex justify-center mt-2">
            <button onClick={() => playAudio(playbackUrl!)} className="icon-btn">
              ▶️
            </button>
          </div>
        )}
        <div className="flex justify-between mt-4">
          <button onClick={onPrev} disabled={index === 0} className="nav-btn px-4 py-2 rounded-full bg-primary text-white">
            Vorige
          </button>
          <button
            onClick={onNext}
            disabled={index === storyData.length - 1}
            className="nav-btn px-4 py-2 rounded-full bg-primary text-white"
          >
            Volgende
          </button>
        </div>
        {feedbackVisible && (
          <div className={`feedback p-4 rounded-xl shadow flex items-center justify-between ${feedbackPositive ? 'bg-green-100' : 'bg-red-100'}`}>
            <p className="text" dangerouslySetInnerHTML={{ __html: feedbackHtml }} />
            <button onClick={onReplay} className="replay-btn bg-primary text-white rounded-full p-2">🔊</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
