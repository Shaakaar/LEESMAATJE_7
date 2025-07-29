import Word from './Word';
import { Volume2 } from 'lucide-react';
import type { StoryItem } from '@/hooks/useStory';

interface ErrorItem {
  expected_word?: string;
  word?: string;
}

interface Props {
  item: StoryItem | null;
  errors?: ErrorItem[] | null;
}

export default function SentenceCard({ item, errors }: Props) {
  if (!item || item.type !== 'sentence') return <p className="min-h-[4rem]" />;
  function playSentence() {
    if (!item) return;
    new Audio('/api/audio/' + item.audio).play();
  }
  const wrongWords = new Set<string>();
  if (errors) {
    for (const err of errors) {
      const expected = (err.expected_word || (err as any).word || '').toLowerCase();
      if (expected) wrongWords.add(expected);
    }
  }
  return (
    <p className="text-2xl md:text-3xl font-semibold">
      {item.text.split(' ').map((w, i) => (
        <Word
          key={i}
          audio={item.words ? item.words[i] : undefined}
          wrong={wrongWords.has(w.toLowerCase())}
        >
          {w}
        </Word>
      ))}
      <button
        aria-label="Spreek zin"
        onClick={playSentence}
        className="inline-flex items-center justify-center ml-2 text-primary"
      >
        <Volume2 className="h-6 w-6" />
      </button>
    </p>
  );
}
