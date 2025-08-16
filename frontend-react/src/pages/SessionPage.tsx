import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { loadContentConfig } from '@/lib/contentConfig';
import { generateStory, generateWords } from '@/lib/storyGenerator';
import { ShimmerText } from '@/components/ShimmerText';

function findLevelUnit(levelId: string, unitId: string) {
  const cfg = loadContentConfig();
  const level = cfg.levels.find((l) => l.id === levelId);
  if (!level) return { level: undefined, unit: undefined };
  const unit = level.units.find((u) => u.id === unitId);
  return { level, unit };
}

export default function SessionPage() {
  const { levelId, unitId } = useParams<{ levelId: string; unitId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  useEffect(() => {
    async function run() {
      if (!levelId || !unitId) return;
      const { level, unit } = findLevelUnit(levelId, unitId);
      if (!level || !unit) return;
      try {
        const unitIdx = level.units.findIndex((u) => u.id === unit.id);
        const focusGraphemes = unit.focus_klanken;
        const allowedGraphemes = Array.from(
          new Set(
            level.units
              .slice(0, unitIdx + 1)
              .flatMap((u) => u.focus_klanken),
          ),
        );
        const allowedPatterns = unit.allowed_patterns;
        const strictForbid = unit.strict_forbid;
        const maxWords = unit.sentence_rules?.max_words ?? 7;

        localStorage.setItem('level', level.id);
        localStorage.setItem('unit', unit.id);
        localStorage.setItem('focus', focusGraphemes.join(','));
        localStorage.setItem('allowed', allowedGraphemes.join(','));
        localStorage.setItem('patterns', allowedPatterns.join(','));
        localStorage.setItem('max_words', String(maxWords));
        localStorage.setItem('strict_forbid', String(strictForbid));

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

        if (unit.mode === 'words') {
          const data = await generateWords({
            levelId: level.id,
            unitId: unit.id,
            focusGraphemes,
            allowedGraphemes,
            allowedPatterns,
          });
          const words = await Promise.all(
            data.words.map(async (w: string) => {
              const audio = await ttsWord(w);
              return { type: 'sentence' as const, text: w, audio, words: [audio] };
            }),
          );
          localStorage.setItem('story_data', JSON.stringify(words));
          navigate('/story');
          return;
        }

        const data = await generateStory({
          theme: 'demo',
          levelId: level.id,
          unitId: unit.id,
          focusGraphemes,
          allowedGraphemes,
          allowedPatterns,
          maxWords,
          chosenDirection: 'start',
          storySoFar: '',
          strictForbid,
        });
        const sentences = await Promise.all(
          data.sentences.map(async (s: string) => ({
            type: 'sentence' as const,
            text: s,
            audio: await tts(s),
            words: await Promise.all(s.split(/\s+/).map((w) => ttsWord(w))),
          })),
        );
        const directions = await Promise.all(
          data.directions.map(async (d: string) => ({
            type: 'direction' as const,
            text: d,
            audio: await tts(d),
            words: await Promise.all(d.split(/\s+/).map((w) => ttsWord(w))),
          })),
        );
        localStorage.setItem('story_data', JSON.stringify([...sentences, ...directions]));
        navigate('/story');
      } catch (err) {
        console.error('Story generation failed', err);
        setError(true);
      }
    }
    run();
  }, [levelId, unitId, navigate]);
  return (
    <AppShell>
      <div className="max-w-md w-full text-center">
        {error ? (
          <p>Er ging iets mis. Probeer het later opnieuw.</p>
        ) : (
          <ShimmerText text="Voorbereiden…" />
        )}
      </div>
    </AppShell>
  );
}

