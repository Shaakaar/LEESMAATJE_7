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
      localStorage.setItem('story_data', JSON.stringify([
        ...data.sentences.map((s) => ({ type: 'sentence', text: s })),
        { type: 'direction', text: data.directions[0] },
        { type: 'direction', text: data.directions[1] },
      ]));
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

