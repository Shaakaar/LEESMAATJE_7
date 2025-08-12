import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/lib/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRecorder } from '@/hooks/useRecorder';
import type { FeedbackData } from '@/hooks/useRecorder';
import { getAudioEl } from '@/utils/audioCache';
import { SentenceDisplay } from '@/components/story/SentenceDisplay';
import type { StoryItem } from '@/components/story/SentenceDisplay';
import { FeedbackBox } from '@/components/story/FeedbackBox';
import { RecordControls } from '@/components/story/RecordControls';
import { buildErrorIndices } from '@/utils/highlighting';

export default function StoryPage() {
  const { studentId, teacherId } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [storyData, setStoryData] = useState<StoryItem[]>([]);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [errorIndices, setErrorIndices] = useState<Set<number>>(new Set());
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const currentItem = storyData[index] ?? null;
  const nextItem =
    currentItem?.type === 'direction' ? (storyData[index + 1] ?? null) : null;

  const sentenceText =
    currentItem && currentItem.type === 'sentence' ? currentItem.text : '';
  const sentenceAudio =
    currentItem && currentItem.type === 'sentence' ? currentItem.audio : undefined;
  const {
    recording,
    status,
    playbackUrl,
    startRecording: recorderStart,
    stopRecording: recorderStop,
  } = useRecorder({
    sentence: sentenceText,
    sentenceAudio,
    teacherId: Number(teacherId) || 0,
    studentId: studentId ?? '',
    onFeedback: (d) => {
      setFeedback(d);
      setIsCorrect(d.correct ?? false);
      const idxs = buildErrorIndices(sentenceText, d.errors || []);
      setErrorIndices(idxs);
    },
    canvas: canvasRef.current,
  });

  useEffect(() => {
    if (sentenceAudio) getAudioEl(sentenceAudio).load();
  }, [sentenceAudio]);

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

  function resetFeedback() {
    setFeedback(null);
    setErrorIndices(new Set());
    setIsCorrect(null);
  }

  function next() {
    if (currentItem && currentItem.type === 'direction') return;
    resetFeedback();
    setIndex((i) => Math.min(i + 1, storyData.length - 1));
  }

  function prev() {
    resetFeedback();
    setIndex((i) => Math.max(i - 1, 0));
  }

  function playRecorded() {
    if (playbackUrl) new Audio(playbackUrl).play();
  }

  function replayFeedback() {
    if (feedback?.feedback_audio) new Audio('/api/audio/' + feedback.feedback_audio).play();
  }

  const progress = ((index + 1) / storyData.length) * 100;

  function handleStartRecording() {
    resetFeedback();
    recorderStart();
  }

  function handleStopRecording() {
    recorderStop();
  }

  return (
    <AppShell>
      <div className="bg-white p-6 mx-auto max-w-xl rounded-xl shadow space-y-4 w-full">
        <label className="font-semibold block text-left" htmlFor="sent">Zin om te lezen:</label>
        <div id="sent" className="bg-white text-[2rem] p-4 rounded-xl shadow text-center">
          <SentenceDisplay
            item={currentItem}
            nextItem={nextItem}
            onDirectionSelect={handleDirection}
            errorIndices={errorIndices}
          />
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <div className="font-bold">{index + 1}/{storyData.length}</div>
        {currentItem?.type === 'sentence' && (
          <RecordControls
            onRecord={handleStartRecording}
            onStop={handleStopRecording}
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
          isCorrect={!!isCorrect}
          onReplay={replayFeedback}
          visible={!!feedback}
        />
      </div>
    </AppShell>
  );
}
