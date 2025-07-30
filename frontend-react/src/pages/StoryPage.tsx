import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/lib/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { useRecorder } from '@/hooks/useRecorder';
import type { FeedbackData } from '@/hooks/useRecorder';
import { SentenceDisplay } from '@/components/story/SentenceDisplay';
import type { StoryItem } from '@/components/story/SentenceDisplay';
import { FeedbackBox } from '@/components/story/FeedbackBox';
import { RecordControls } from '@/components/story/RecordControls';

export default function StoryPage() {
  const { studentId, teacherId } = useAuthStore();
  const navigate = useNavigate();
  const [storyData, setStoryData] = useState<StoryItem[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedDir, setSelectedDir] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const currentItem = storyData[index] ?? null;

  const { recording, status, playbackUrl, startRecording, stopRecording } = useRecorder({
    sentence: currentItem && currentItem.type === 'sentence' ? currentItem.text : '',
    teacherId: Number(teacherId) || 0,
    studentId: studentId ?? '',
    onFeedback: (d) => setFeedback(d),
    canvas: canvasRef.current,
  });

  useEffect(() => {
    const data = localStorage.getItem('story_data');
    if (!data || !studentId) {
      navigate('/');
      return;
    }
    try {
      setStoryData(JSON.parse(data));
    } catch {
      navigate('/');
    }
  }, [studentId, navigate]);

  useEffect(() => {
    setSelectedDir(null);
  }, [index]);

  function next() {
    if (currentItem && currentItem.type === 'direction') {
      if (selectedDir === null) return;
      const choice = selectedDir === 0 ? currentItem.text : (storyData[index + 1] as any).text;
      const theme = localStorage.getItem('theme');
      const level = localStorage.getItem('level');
      const url = `/api/continue_story?theme=${theme}&level=${level}&direction=${encodeURIComponent(choice)}`;
      const ev = new EventSource(url);
      const newData: StoryItem[] = [];
      ev.addEventListener('sentence', (e) => newData.push({ type: 'sentence', ...(JSON.parse((e as MessageEvent).data)) }));
      ev.addEventListener('direction', (e) => newData.push({ type: 'direction', ...(JSON.parse((e as MessageEvent).data)) }));
      ev.addEventListener('complete', () => {
        ev.close();
        setStoryData((s) => {
          const arr = [...s];
          arr.splice(index, 2, ...newData);
          return arr;
        });
      });
      return;
    }
    setIndex((i) => Math.min(i + 1, storyData.length - 1));
  }

  function prev() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  function playRecorded() {
    if (playbackUrl) new Audio(playbackUrl).play();
  }

  function replayFeedback() {
    if (feedback?.feedback_audio) new Audio('/api/audio/' + feedback.feedback_audio).play();
  }

  const negative = useMemo(() => {
    if (!feedback) return false;
    if (typeof feedback.correct === 'boolean') return !feedback.correct;
    return /opnieuw|niet gehoord|again|wrong/i.test(feedback.feedback_text);
  }, [feedback]);

  const progress = (index + 1) / storyData.length * 100;

  return (
    <AppShell>
      <div className="bg-white p-6 mx-auto max-w-xl rounded-xl shadow space-y-4 w-full">
        <label className="font-semibold block text-left" htmlFor="sent">Zin om te lezen:</label>
        <div id="sent" className="bg-white text-[2rem] p-4 rounded-xl shadow text-center">
          <SentenceDisplay item={currentItem} selectedDirection={selectedDir} setSelectedDirection={setSelectedDir} />
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <div className="font-bold">{index + 1}/{storyData.length}</div>
        <RecordControls
          onRecord={startRecording}
          onStop={stopRecording}
          recording={recording}
          playbackUrl={playbackUrl}
          onPlayback={playRecorded}
          status={status}
          canvasRef={canvasRef}
        />
        <div className="flex justify-between mt-4">
          <button onClick={prev} disabled={index === 0} className="flex items-center gap-1 px-4 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-50">
            <i className="lucide lucide-chevrons-left" /> Vorige
          </button>
          <button onClick={next} disabled={index === storyData.length - 1} className="flex items-center gap-1 px-4 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-50">
            Volgende <i className="lucide lucide-chevrons-right" />
          </button>
        </div>
        <FeedbackBox
          text={feedback ? feedback.feedback_text.replace(/\*\*(.*?)\*\*/g, '<strong class="highlight">$1</strong>') : ''}
          negative={negative}
          onReplay={replayFeedback}
          visible={!!feedback}
        />
      </div>
    </AppShell>
  );
}
