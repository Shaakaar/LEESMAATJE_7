import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Progress } from '@/components/ui/progress';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/useAuthStore';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

export default function PlayPage() {
  const { levelId, themeId } = useParams<{ levelId: string; themeId: string }>();
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();
  const { studentId, teacherId, name } = useAuthStore();

  useEffect(() => {
    const ev = new EventSource(`/api/start_story?theme=${themeId}&level=${levelId}`);
    const data: unknown[] = [];
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
      localStorage.setItem('story_data', JSON.stringify(data));
      localStorage.setItem('theme', String(themeId));
      localStorage.setItem('level', String(levelId));
      const q = new URLSearchParams({
        student_id: studentId ?? '',
        teacher_id: teacherId ?? '',
        name: name ?? '',
      });
      window.location.href = `/static/story.html?${q.toString()}`;
    });
    return () => {
      ev.close();
    };
  }, [levelId, themeId, studentId, teacherId, name, navigate]);

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 w-full max-w-md text-center">
        <h2 className="font-title text-xl">Voorbereiden…</h2>
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
