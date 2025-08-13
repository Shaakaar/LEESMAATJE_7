import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Progress } from '@/components/ui/progress';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import type { StoryItem } from '@/components/story/SentenceDisplay';
import { ShimmerText } from '@/components/ShimmerText';

export default function ContinuePage() {
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const theme = localStorage.getItem('theme');
    const level = localStorage.getItem('level');
    const direction = localStorage.getItem('direction_choice');
    const idx = Number(localStorage.getItem('direction_index'));

    if (!theme || !level || !direction || Number.isNaN(idx)) {
      navigate('/');
      return;
    }

    const ev = new EventSource(`/api/continue_story?theme=${theme}&level=${level}&direction=${encodeURIComponent(direction)}`);
    const data: StoryItem[] = [];

    ev.addEventListener('progress', (e) => {
      setProgress(parseFloat((e as MessageEvent).data) * 100);
    });
    ev.addEventListener('sentence', (e) => {
      data.push({ type: 'sentence', ...(JSON.parse((e as MessageEvent).data)) });
    });
    ev.addEventListener('direction', (e) => {
      data.push({ type: 'direction', ...(JSON.parse((e as MessageEvent).data)) });
    });
    ev.addEventListener('complete', () => {
      ev.close();
      const story = JSON.parse(localStorage.getItem('story_data') ?? '[]');
      story.splice(idx, 2, ...data);
      localStorage.setItem('story_data', JSON.stringify(story));
      localStorage.setItem('story_index', String(idx));
      localStorage.removeItem('direction_choice');
      localStorage.removeItem('direction_index');
      navigate(`/story${location.search}`);
    });
    return () => {
      ev.close();
    };
  }, [navigate, location.search]);

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 w-full max-w-md text-center">
        <h2 className="font-title text-xl">
          <ShimmerText text="Voorbereiden…" />
        </h2>
        <div className="flex justify-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
            <BookOpen className="h-12 w-12 text-primary" />
          </motion.div>
        </div>
        <Progress value={progress} />
        <p className="text-sm text-slate-600">{Math.round(progress)}%</p>
      </motion.div>
    </AppShell>
  );
}
