import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/lib/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRecorder } from '@/hooks/useRecorder';
import type { FeedbackData } from '@/hooks/useRecorder';
import { SentenceDisplay } from '@/components/story/SentenceDisplay';
import type { StoryItem } from '@/components/story/SentenceDisplay';
import { FeedbackBox } from '@/components/story/FeedbackBox';
import { RecordControls } from '@/components/story/RecordControls';
import { buildHighlightMap } from '@/utils/highlight';

export default function StoryPage() {
  const { studentId, teacherId } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [storyData, setStoryData] = useState<StoryItem[]>([]);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [debug, setDebug] = useState(() => localStorage.getItem('debug_json') === '1');

  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const currentItem = storyData[index] ?? null;
  const nextItem =
    currentItem?.type === 'direction' ? (storyData[index + 1] ?? null) : null;

  const {
    recording,
    status,
    playbackUrl,
    startRecording: startRec,
    stopRecording,
  } = useRecorder({
    sentence: currentItem && currentItem.type === 'sentence' ? currentItem.text : '',
    sentenceAudio:
      currentItem && currentItem.type === 'sentence' ? currentItem.audio : undefined,
    teacherId: Number(teacherId) || 0,
    studentId: studentId ?? '',
    onFeedback: (d) => setFeedback(d),
    canvas: canvasRef.current,
  });

  function startRecording() {
    setFeedback(null);
    startRec();
  }

  useEffect(() => {
    const data = localStorage.getItem('story_data');
    if (!data || !studentId) {
      navigate('/');
      return;
    }
    try {
      setStoryData(JSON.parse(data));
      const idx = Number(localStorage.getItem('story_index'));
      if (!Number.isNaN(idx)) {
        setIndex(idx);
        localStorage.removeItem('story_index');
      }
    } catch {
      navigate('/');
    }
  }, [studentId, navigate]);

  function handleDirection(choice: number) {
    if (!currentItem || currentItem.type !== 'direction') return;
    const choiceText =
      choice === 0
        ? currentItem.text
        : (storyData[index + 1] as StoryItem).text;
    localStorage.setItem('direction_choice', choiceText);
    localStorage.setItem('direction_index', String(index));
    navigate(`/continue${location.search}`);
  }

  function next() {
    if (currentItem && currentItem.type === 'direction') return;
    setFeedback(null);
    setIndex((i) => Math.min(i + 1, storyData.length - 1));
  }

  function prev() {
    setFeedback(null);
    setIndex((i) => Math.max(i - 1, 0));
  }

  function playRecorded() {
    if (playbackUrl) new Audio(playbackUrl).play();
  }

  function replayFeedback() {
    if (feedback?.feedback_audio) new Audio('/api/audio/' + feedback.feedback_audio).play();
  }

  const negative = useMemo(() => {
    return feedback ? !feedback.is_correct : false;
  }, [feedback]);

  const highlights = useMemo(() => {
    if (!feedback || !currentItem || currentItem.type !== 'sentence')
      return { map: {}, insertions: [] };
    return buildHighlightMap(
      feedback.reference_text || currentItem.text,
      feedback.errors ?? [],
      feedback.is_correct,
    );
  }, [feedback, currentItem]);

  function toggleDebug() {
    setDebug((d) => {
      const nd = !d;
      localStorage.setItem('debug_json', nd ? '1' : '0');
      return nd;
    });
  }

  const progress = ((index + 1) / storyData.length) * 100;

  return (
    <AppShell>
      <div className="bg-white p-6 mx-auto max-w-xl rounded-xl shadow space-y-4 w-full relative">
        <button
          onClick={toggleDebug}
          className="absolute top-2 right-2 text-slate-500"
          aria-label="Debug"
        >
          <i className="lucide lucide-settings" />
        </button>
        <label className="font-semibold block text-left" htmlFor="sent">Zin om te lezen:</label>
        <div id="sent" className="bg-white text-[2rem] p-4 rounded-xl shadow text-center">
          <SentenceDisplay
            item={currentItem}
            nextItem={nextItem}
            onDirectionSelect={handleDirection}
            highlights={highlights.map}
            insertions={highlights.insertions}
          />
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <div className="font-bold">{index + 1}/{storyData.length}</div>
        {currentItem?.type === 'sentence' && (
          <RecordControls
            onRecord={startRecording}
            onStop={stopRecording}
            recording={recording}
            playbackUrl={playbackUrl}
            onPlayback={playRecorded}
            status={status}
            canvasRef={canvasRef}
          />
        )}
        <div className="flex justify-between mt-4">
          <button
            onClick={prev}
            disabled={index === 0}
            className="flex items-center gap-1 px-4 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-50"
          >
            <i className="lucide lucide-chevrons-left" /> Vorige
          </button>
          <button
            onClick={next}
            disabled={index === storyData.length - 1 || currentItem?.type === 'direction'}
            className="flex items-center gap-1 px-4 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-50"
          >
            Volgende <i className="lucide lucide-chevrons-right" />
          </button>
        </div>
        <FeedbackBox
          text={
            feedback
              ? feedback.feedback_text.replace(
                  /\*\*(.*?)\*\*/g,
                  '<strong class="highlight">$1</strong>',
                )
              : ''
          }
          negative={negative}
          onReplay={replayFeedback}
          visible={!!feedback}
        />
        {debug && feedback && (
          <pre className="mt-4 p-2 bg-slate-100 rounded text-xs overflow-auto">
            {JSON.stringify(feedback, null, 2)}
          </pre>
        )}
      </div>
    </AppShell>
  );
}
