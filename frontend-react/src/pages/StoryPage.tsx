import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/lib/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRecorder } from '@/hooks/useRecorder';
import type { FeedbackData } from '@/hooks/useRecorder';
import { SentenceDisplay } from '@/components/story/SentenceDisplay';
import type { StoryItem, Highlights } from '@/components/story/SentenceDisplay';
import { FeedbackBox } from '@/components/story/FeedbackBox';
import { RecordControls } from '@/components/story/RecordControls';

export default function StoryPage() {
  const { studentId, teacherId } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [storyData, setStoryData] = useState<StoryItem[]>([]);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const currentItem = storyData[index] ?? null;
  const nextItem =
    currentItem?.type === 'direction' ? (storyData[index + 1] ?? null) : null;

  const { recording, status, playbackUrl, startRecording, stopRecording } = useRecorder({
    sentence: currentItem && currentItem.type === 'sentence' ? currentItem.text : '',
    sentenceAudio:
      currentItem && currentItem.type === 'sentence' ? currentItem.audio : undefined,
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

  const highlights: Highlights = useMemo(() => {
    if (!feedback?.errors || !currentItem || currentItem.type !== 'sentence') return {};

    // Split the *displayed* text the same way SentenceDisplay does
    const words = currentItem.text.split(/\s+/);

    // Normalize words for matching (strip punctuation, lowercase)
    const norm = (s: string) => s.replace(/[^\p{L}\p{N}']/gu, '').toLowerCase();

    const bad = new Set(
      feedback.errors
        .map((e) => (e.expected_word ?? '').toString())
        .map(norm)
        .filter(Boolean),
    );

    const map: Highlights = {};
    words.forEach((w, i) => {
      if (bad.has(norm(w))) map[i] = 'error';
    });
    return map;
  }, [feedback, currentItem]);

  const progress = (index + 1) / storyData.length * 100;

  return (
    <AppShell>
      <div className="bg-white p-6 mx-auto max-w-xl rounded-xl shadow space-y-4 w-full">
        <label className="font-semibold block text-left" htmlFor="sent">Zin om te lezen:</label>
        <div id="sent" className="bg-white text-[2rem] p-4 rounded-xl shadow text-center">
          <SentenceDisplay
            item={currentItem}
            nextItem={nextItem}
            onDirectionSelect={handleDirection}
            highlights={highlights}
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
          text={feedback ? feedback.feedback_text.replace(/\*\*(.*?)\*\*/g, '<strong class="highlight">$1</strong>') : ''}
          negative={negative}
          onReplay={replayFeedback}
          visible={!!feedback}
        />
      </div>
    </AppShell>
  );
}
