import { useState, useEffect } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast, ToastViewport } from '@/components/ui/toast';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@/lib/useAuthStore';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2, ChevronsLeft, ChevronsRight, Mic, Loader2, RefreshCw } from 'lucide-react';
import { useStoryData } from '@/features/play/useStoryData';
import { useRecorder } from '@/features/play/useRecorder';

export default function PlayPage() {
  const { levelId, themeId, idx } = useParams<{
    levelId: string;
    themeId: string;
    idx?: string;
  }>();
  const story = useStoryData(levelId, themeId);
  const [index, setIndex] = useState(() => Number(idx ?? 0));
  const { studentId, teacherId } = useAuthStore();
  const current = story ? story[index] : null;
  const { state, start, stop, playbackUrl, result, level, reset } = useRecorder(
    current?.text ?? null,
    teacherId,
    studentId
  );
  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    if (result) {
      toast({
        title: result.correct ? 'Goed gedaan!' : 'Probeer opnieuw',
        description: '',
        variant: result.correct ? 'default' : 'destructive',
      });
    }
  }, [result]);

  useEffect(() => {
    let raf: number;
    if (state === 'recording') {
      const draw = () => {
        setMicLevel(level());
        raf = requestAnimationFrame(draw);
      };
      draw();
    }
    return () => cancelAnimationFrame(raf);
  }, [state, level]);

  useEffect(() => {
    if (studentId && themeId && levelId) {
      localStorage.setItem(
        `${studentId}|${themeId}|${levelId}`,
        String(index)
      );
    }
  }, [index, studentId, themeId, levelId]);

  if (!story || !current) {
    return (
      <AppShell>
        <div className="space-y-6 w-full max-w-md text-center">
          <h2 className="font-title text-xl">Voorbereiden…</h2>
          <div className="flex justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            >
              <Loader2 className="h-12 w-12 text-primary" />
            </motion.div>
          </div>
          <Progress value={0} />
        </div>
      </AppShell>
    );
  }

  const total = story.length;
  const progress = ((index + 1) / total) * 100;

  function playSentence() {
    new Audio('/api/audio/' + current!.audio).play();
  }

  function playWord(i: number) {
    const audio = current!.words[i];
    if (audio) new Audio('/api/audio/' + audio).play();
  }

  const canPrev = index > 0;
  const canNext = index < total - 1;

  return (
    <AppShell>
      <ToastViewport />
      <div className="flex flex-col items-center w-full min-h-screen justify-center bg-gradient-to-b from-[#ecf7ff] to-[#f5fbff] p-4">
        <div className="w-full max-w-3xl space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -100, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-6 text-center shadow-xl space-y-4">
                <button
                  onClick={playSentence}
                  className="ml-auto block text-slate-600 hover:text-primary"
                >
                  <Volume2 className="h-6 w-6" />
                </button>
                <p className="text-xl flex flex-wrap justify-center gap-1">
                  {current.text.split(' ').map((w, i) => {
                    const audio = current.words[i];
                    return audio ? (
                      <button
                        key={i}
                        onClick={() => playWord(i)}
                        className="hover:bg-primary/20 rounded px-1"
                      >
                        {w}
                      </button>
                    ) : (
                      <span key={i}>{w}</span>
                    );
                  })}
                </p>
              </Card>
            </motion.div>
          </AnimatePresence>
          <Progress value={progress} />
          <div className="flex flex-col items-center gap-4">
            <div className="relative" style={{
                width: '40vh',
                height: '40vh',
                maxWidth: '300px',
                maxHeight: '300px',
                minWidth: '150px',
                minHeight: '150px',
              }}>
              <div
                className="absolute inset-0 rounded-full border-4 border-primary/50"
                style={{ transform: `scale(${1 + micLevel})` }}
              />
              <button
                onClick={state === 'recording' ? stop : start}
                className={`rounded-full bg-primary text-white flex items-center justify-center w-full h-full ${
                  state === 'recording' ? 'animate-pulse' : ''
                }`}
              >
                {state === 'analysing' ? (
                  <Loader2 className="h-12 w-12 animate-spin" />
                ) : (
                  <Mic className="h-12 w-12" />
                )}
              </button>
            </div>
            {playbackUrl && (
              <audio controls src={playbackUrl} className="w-full" />
            )}
            {playbackUrl && (
              <Button
                variant="secondary"
                onClick={() => {
                  reset();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Opnieuw
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between text-lg">
            <Button variant="secondary" onClick={() => setIndex(index - 1)} disabled={!canPrev}>
              <ChevronsLeft className="h-5 w-5" />
            </Button>
            <span>
              {index + 1} / {total}
            </span>
            <Button variant="secondary" onClick={() => setIndex(index + 1)} disabled={!canNext}>
              <ChevronsRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
