import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { loadContentConfig } from '@/lib/contentConfig';
import { generateTurn } from '@/lib/storyGenerator';

function allowedFor(levelId: string, unitId: string) {
  const cfg = loadContentConfig();
  const level = cfg.levels.find((l) => l.id === levelId);
  if (!level) return { level: undefined, unit: undefined, allowed: [] };
  const idx = level.units.findIndex((u) => u.id === unitId);
  const allowed = level.units.slice(0, idx + 1).flatMap((u) => u.focus_phonemes);
  return { level, unit: level.units[idx], allowed };
}

export default function SessionPage() {
  const { levelId, unitId } = useParams<{ levelId: string; unitId: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    async function run() {
      if (!levelId || !unitId) return;
      const { level, unit, allowed } = allowedFor(levelId, unitId);
      if (!level || !unit) return;
      const data = await generateTurn({
        theme: 'demo',
        level,
        unit,
        allowedGraphemes: allowed,
      });
      async function tts(text: string) {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const j = (await res.json()) as { audio: string };
        return j.audio;
      }
      async function ttsWord(text: string) {
        const res = await fetch('/api/tts_word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const j = (await res.json()) as { audio: string };
        return j.audio;
      }
      const sentences = await Promise.all(
        data.sentences.map(async (s) => ({
          type: 'sentence' as const,
          text: s,
          audio: await tts(s),
          words: await Promise.all(s.split(/\s+/).map((w) => ttsWord(w))),
        })),
      );
      const directions = await Promise.all(
        data.directions.map(async (d) => ({
          type: 'direction' as const,
          text: d,
          audio: await tts(d),
          words: await Promise.all(d.split(/\s+/).map((w) => ttsWord(w))),
        })),
      );
      localStorage.setItem('story_data', JSON.stringify([...sentences, ...directions]));
      navigate('/story');
    }
    run();
  }, [levelId, unitId, navigate]);
  return (
    <AppShell>
      <div className="max-w-md w-full text-center">Voorbereiden…</div>
    </AppShell>
  );
}

