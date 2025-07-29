import { useParams } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/lib/useAuthStore';
import SentenceCard from '@/components/story/SentenceCard';
import ProgressBar from '@/components/story/ProgressBar';
import MicButton from '@/components/story/MicButton';
import NavButton from '@/components/story/NavButton';
import FeedbackToast from '@/components/story/FeedbackToast';
import DirectionsChooser from '@/components/story/DirectionsChooser';
import { useRecorder } from '@/hooks/useRecorder';
import { useStory } from '@/hooks/useStory';
import { useEffect } from 'react';

export default function StoryPage() {
  const { levelId = '', themeId = '' } = useParams<{ levelId: string; themeId: string }>();
  const { studentId, teacherId } = useAuthStore();
  const story = useStory(levelId, themeId);
  const rec = useRecorder(studentId, teacherId ? parseInt(teacherId, 10) : null);

  useEffect(() => {
    rec.reset();
  }, [story.index, rec]);

  if (story.loading) {
    return (
      <AppShell>
        <div className="space-y-6 text-center">
          <h2 className="font-title text-xl">Voorbereiden…</h2>
          <ProgressBar current={Math.round(story.initProgress * 100)} total={100} />
        </div>
      </AppShell>
    );
  }

  const item = story.item;
  const isDirection = item && item.type === 'direction';
  const directionOpts = isDirection ? [item, story.story[story.index + 1]] : null;

  return (
    <AppShell>
      <div className="w-full max-w-xl bg-gradient-to-b from-primary/5 to-primary/0 p-6 rounded-2xl">
        <SentenceCard
          item={item?.type === 'sentence' ? item : null}
          errors={rec.lastFeedback?.errors as any}
        />
        {directionOpts && (
          <DirectionsChooser
            options={directionOpts}
            selected={story.selectedDirection}
            onSelect={story.setSelectedDirection}
          />
        )}
        <ProgressBar current={isDirection ? story.index + 2 : story.index + 1} total={story.total} />
        <div className="flex flex-col items-center mt-4">
          <MicButton
            onClick={rec.isRecording ? rec.stop : () => rec.start(item?.text ?? '')}
            recording={rec.isRecording}
            waveLevel={rec.waveLevel}
          />
          <div className="flex gap-4 mt-4">
            <button
              onClick={rec.playRecording}
              disabled={!rec.playbackUrl}
              aria-label="Speel opname af"
              className="text-primary disabled:opacity-50"
            >
              <span className="sr-only">Speel opname af</span>
              ▶
            </button>
          </div>
        </div>
        <div className="flex justify-between mt-4">
          <NavButton direction="prev" onClick={story.prev} disabled={story.index === 0 || rec.isRecording} />
          <NavButton direction="next" onClick={story.next} disabled={rec.isRecording} />
        </div>
        {rec.lastFeedback && (
          <FeedbackToast
            text={rec.lastFeedback.feedback_text.replace(/\*\*(.*?)\*\*/g, '<strong class="highlight">$1</strong>')}
            positive={rec.lastFeedback.correct !== false}
            onReplay={rec.replayFeedback}
          />
        )}
      </div>
    </AppShell>
  );
}
